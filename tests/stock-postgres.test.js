import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedPostgres } from './helpers/isolated-postgres.mjs';
import { createInventoryRepository } from '../server/inventory.js';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

test('transactional stock management in an isolated real PostgreSQL cluster', {
  skip: !process.env.TEST_PG_BIN ? 'Set TEST_PG_BIN to run isolated PostgreSQL integration tests.' : false,
  timeout: 180000
}, async t => {
  const db = await isolatedPostgres();
  const inventory = createInventoryRepository(db.pool);
  let fixture;
  try {
    // Synthetic singleton exists only in the disposable cluster for movement FKs.
    await db.owner.query("INSERT INTO public.admin_account(id,username,password_hash) VALUES(1,'test-only','not-a-login-hash')");
    fixture = await startTestServer({ inventory });
    const client = testClient(fixture.url); await client.login();
    const token = await client.token();
    const category = await inventory.create('categories', { name: 'Stock tests' }, randomUUID());
    async function material(name = 'Test material') {
      return inventory.create('materials', { name, categoryId: category.id }, randomUUID());
    }
    const item = (row, quantity) => ({ materialId: row.id, quantity });
    const operation = (type, items, extra = {}) => ({ operationId: randomUUID(), type, items, ...extra });
    async function post(body, target = client, csrf = token) {
      const response = await target.request('/api/stock-operations', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return { status: response.status, ...await response.json() };
    }
    async function applied(body) { const result = await post(body); assert.equal(result.status, 201, JSON.stringify(result)); return result.data; }
    async function stock(row) { return (await inventory.findMaterial(row.id)).quantity; }
    async function rowsFor(id) { return (await db.pool.query('SELECT material_id,quantity_delta::text,reason,admin_id FROM public.stock_movements WHERE operation_id=$1 ORDER BY material_id', [id])).rows; }
    async function assertNoOperation(id) { assert.deepEqual(await rowsFor(id), []); }
    async function waitForRowLock() {
      for (let i = 0; i < 200; i++) {
        const waiting = await db.owner.query("SELECT count(*) FROM pg_stat_activity WHERE datname='inventory_api_test' AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'");
        if (waiting.rows[0].count !== '0') return;
        await new Promise(done => setTimeout(done, 10));
      }
      assert.fail('Expected a real PostgreSQL row-lock wait');
    }

    await t.test('single addition and deduction preserve exact decimals, signed history, Admin and zero-stock records', async () => {
      const a = await material('وسایل');
      const add = operation('add', [item(a, '150.750')], { reason: '  وسایل received  ' });
      const added = await applied(add);
      assert.equal(added.replayed, false); assert.equal(added.balances[0].quantity, '150.75');
      assert.notEqual(added.balances[0].version, a.version);
      assert.equal(added.movements[0].quantityDelta, '150.75'); assert.equal(added.movements[0].type, 'add');
      assert.equal((await rowsFor(add.operationId))[0].admin_id, 1);
      const removed = await applied(operation('remove', [item(a, '150.750')]));
      assert.equal(removed.balances[0].quantity, '0.00');
      assert.equal(removed.movements[0].quantityDelta, '-150.75');
      assert.ok(await inventory.findMaterial(a.id));
      assert.equal((await db.pool.query('SELECT count(*) FROM public.materials WHERE id=$1', [a.id])).rows[0].count, '1');
    });

    await t.test('multi-material add/remove combine repetitions exactly and insert one movement per material', async () => {
      const a = await material(), b = await material();
      const add = operation('add', [item(b, '0.125'),item(a,'2'),item(a,'3.500'),item(b,'0.375')]);
      const result = await applied(add);
      assert.equal(await stock(a), '5.5'); assert.equal(await stock(b), '0.5');
      assert.equal(result.movements.length, 2);
      assert.deepEqual(new Set(result.movements.map(row => row.operationId)), new Set([add.operationId]));
      await applied(operation('remove', [item(a,'1.125'),item(b,'0.125')]));
      assert.equal(await stock(a),'4.375'); assert.equal(await stock(b),'0.375');
    });

    await t.test('insufficient stock in one batch item preserves all balances, versions and history', async () => {
      const a=await material(), b=await material();
      await applied(operation('add',[item(a,'20'),item(b,'5')]));
      const before=await Promise.all([inventory.findMaterial(a.id),inventory.findMaterial(b.id)]);
      const remove=operation('remove',[item(a,'10'),item(b,'8')]);
      assert.equal((await post(remove)).status,409);
      assert.equal(await stock(a),'20'); assert.equal(await stock(b),'5');
      assert.deepEqual((await Promise.all([inventory.findMaterial(a.id),inventory.findMaterial(b.id)])).map(row=>row.version),before.map(row=>row.version));
      await assertNoOperation(remove.operationId);
      const repeated=operation('remove',[item(b,'3'),item(b,'3')]);
      assert.equal((await post(repeated)).status,409); await assertNoOperation(repeated.operationId);
    });

    await t.test('missing materials, invalid precision, zero and invalid IDs never partially commit', async () => {
      const a=await material();
      const bodies=[
        [operation('add',[item(a,'1'),{materialId:randomUUID(),quantity:'1'}]),404],
        ...['0','-1','0.0001','1000000000',0.125].map(quantity=>[operation('add',[item(a,'1'),item(a,quantity)]),422]),
        [operation('add',[{materialId:'bad',quantity:'1'}]),400]
      ];
      for(const [body,status] of bodies){assert.equal((await post(body)).status,status); await assertNoOperation(body.operationId);}
      assert.equal(await stock(a),'0');
    });

    await t.test('maximum stock and resulting-stock overflow are exact and checked before any update', async () => {
      const a=await material(), b=await material();
      await applied(operation('add',[item(a,'999999999.998')]));
      await applied(operation('add',[item(a,'0.001')]));
      assert.equal(await stock(a),'999999999.999');
      const overflow=operation('add',[item(b,'1'),item(a,'0.001')]);
      assert.equal((await post(overflow)).status,409); await assertNoOperation(overflow.operationId);
      assert.equal(await stock(b),'0'); assert.equal(await stock(a),'999999999.999');
      const combined=operation('add',[item(b,'999999999.999'),item(b,'0.001')]);
      assert.equal((await post(combined)).status,422); await assertNoOperation(combined.operationId);
    });

    await t.test('equivalent retries survive repository recreation, item reordering/splitting and later stock changes', async () => {
      const a=await material(), b=await material();
      const body=operation('add',[item(a,'2.500'),item(a,'3'),item(b,'0.125')],{reason:' received '});
      const first=await applied(body);
      await applied(operation('remove',[item(a,'1')]));
      const equivalent={...body,operationId:body.operationId.toUpperCase(),reason:'received',items:[item(b,'0.125'),item(a,'5.5')]};
      const fresh=createInventoryRepository(db.pool);
      const replay=await fresh.operateStock(equivalent,1);
      assert.equal(replay.replayed,true);
      assert.deepEqual(replay.movements.map(row=>row.id),first.movements.map(row=>row.id));
      assert.equal(replay.balances.find(row=>row.materialId===a.id).quantity,'4.5');
      const http=await post(equivalent); assert.equal(http.status,200); assert.equal(http.data.replayed,true);
      assert.equal(await stock(a),'4.5'); assert.equal((await rowsFor(body.operationId)).length,2);
    });

    await t.test('changed quantity, material set, type or reason with a reused operation ID always conflicts', async () => {
      const a=await material(), b=await material(), c=await material();
      const body=operation('add',[item(a,'2'),item(b,'3')]); await applied(body);
      for(const altered of [
        {...body,items:[item(a,'2'),item(b,'4')]}, {...body,items:[item(a,'2')]},
        {...body,items:[...body.items,item(c,'1')]}, {...body,items:[item(a,'2'),item(c,'3')]},
        {...body,type:'remove'}, {...body,reason:''}, {...body,reason:'different'}
      ]) assert.equal((await post(altered)).status,409);
      assert.equal(await stock(a),'2'); assert.equal(await stock(b),'3'); assert.equal(await stock(c),'0');
      assert.equal((await post({...body,reason:null})).status,200);
    });

    await t.test('concurrent identical operation IDs apply exactly once; conflicting concurrent bodies cannot append items', async () => {
      const a=await material(), b=await material();
      const body=operation('add',[item(a,'0.125'),item(b,'1')]);
      const receiptsBefore=(await db.pool.query('SELECT count(*) FROM public.inventory_create_requests')).rows[0].count;
      const results=await Promise.all([1,2,3].map(()=>post(body)));
      assert.deepEqual(results.map(r=>r.status).sort(),[200,200,201]);
      assert.equal(results.filter(r=>!r.data.replayed).length,1);
      assert.equal(await stock(a),'0.125'); assert.equal((await rowsFor(body.operationId)).length,2);
      assert.equal((await db.pool.query('SELECT count(*) FROM public.inventory_create_requests')).rows[0].count,receiptsBefore);
      const conflict=operation('add',[item(a,'1')]);
      const competing=await Promise.all([post(conflict),post({...conflict,items:[item(a,'1'),item(b,'2')]})]);
      assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);
      assert.equal(await stock(a),'1.125');
    });

    await t.test('two concurrent deductions observe locked authoritative stock so only one can remove 15 from 20', async () => {
      const a=await material(); await applied(operation('add',[item(a,'20')]));
      const requests=[operation('remove',[item(a,'15')]),operation('remove',[item(a,'15')])];
      const results=await Promise.all(requests.map(body=>post(body)));
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]); assert.equal(await stock(a),'5');
      await assertNoOperation(requests[results.findIndex(r=>r.status===409)].operationId);
    });

    await t.test('concurrent additions/deductions and opposite-order batches commit without lost updates/deadlocks', async () => {
      const a=await material(),b=await material(); await applied(operation('add',[item(a,'10'),item(b,'10')]));
      const results=await Promise.all([
        post(operation('add',[item(b,'0.125'),item(a,'0.125')])),
        post(operation('remove',[item(a,'0.250'),item(b,'0.250')]))
      ]);
      assert.deepEqual(results.map(r=>r.status),[201,201]);
      assert.equal(await stock(a),'9.875'); assert.equal(await stock(b),'9.875');
      const opposite=await Promise.all([
        post(operation('remove',[item(a,'1'),item(b,'2')])),
        post(operation('remove',[item(b,'1'),item(a,'2')]))
      ]);
      assert.deepEqual(opposite.map(r=>r.status),[201,201]);
      assert.equal(await stock(a),'6.875'); assert.equal(await stock(b),'6.875');
    });

    await t.test('movement insertion failure rolls back all updates and earlier movement rows; same-ID retry can succeed', async () => {
      const selections=[await material(),await material()].sort((a,b)=>a.id<b.id?-1:1);
      const before=await Promise.all(selections.map(row=>inventory.findMaterial(row.id)));
      await db.owner.query(`CREATE FUNCTION public.fail_test_movement() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.material_id::text = TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic movement failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_test_movement BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.fail_test_movement('${selections[1].id}')`);
      const body=operation('add',selections.map(row=>item(row,'1.125')));
      try {
        const failed=await post(body); assert.equal(failed.status,503); assert.match(failed.error,/could not be confirmed/);
        await assertNoOperation(body.operationId);
        for(let i=0;i<selections.length;i++){
          const current=await inventory.findMaterial(selections[i].id);
          assert.equal(current.quantity,'0'); assert.equal(current.version,before[i].version);
        }
      } finally { await db.owner.query('DROP TRIGGER fail_test_movement ON public.stock_movements; DROP FUNCTION public.fail_test_movement()'); }
      await applied(body); assert.equal((await rowsFor(body.operationId)).length,2);
    });

    await t.test('a simulated lost COMMIT acknowledgement returns uncertainty, then same-ID retry proves exactly one effect', async () => {
      const a=await material(); let lose=true;
      const lossy=createInventoryRepository({ connect:async()=>{
        const connection=await db.pool.connect();
        return {query:async(sql,values)=>{
          const result=await connection.query(sql,values);
          if(sql==='COMMIT'&&lose){lose=false;throw Object.assign(new Error('simulated lost acknowledgement'),{code:'ECONNRESET'});}
          return result;
        },release:discard=>connection.release(discard)};
      }});
      const server=await startTestServer({inventory:lossy});
      try {
        const browser=testClient(server.url); await browser.login(); const csrf=await browser.token();
        const body=operation('add',[item(a,'0.125')]);
        assert.equal((await post(body,browser,csrf)).status,503);
        const retry=await post(body,browser,csrf); assert.equal(retry.status,200); assert.equal(retry.data.replayed,true);
        assert.equal(await stock(a),'0.125'); assert.equal((await rowsFor(body.operationId)).length,1);
      } finally {await server.close();}
    });

    await t.test('failure immediately before COMMIT rolls back balances/history and releases the transaction', async () => {
      const a=await material(); const body=operation('add',[item(a,'2')]);
      const failing=createInventoryRepository({connect:async()=>{
        const connection=await db.pool.connect();
        return {query:(sql,values)=>{if(sql==='COMMIT')throw new Error('synthetic pre-commit failure');return connection.query(sql,values);},release:discard=>connection.release(discard)};
      }});
      await assert.rejects(failing.operateStock(body,1));
      assert.equal(await stock(a),'0'); await assertNoOperation(body.operationId);
      await applied(body);
    });

    await t.test('stock changes invalidate metadata versions, preserve metadata and prevent deleting movement history', async () => {
      const a=await material('Kept name'); await applied(operation('add',[item(a,'1')]));
      await assert.rejects(inventory.update('materials',a.id,{name:'Stale'},a.version),{status:409});
      const current=await inventory.findMaterial(a.id);
      const updated=await inventory.update('materials',a.id,{description:'Metadata only'},current.version);
      assert.equal(updated.quantity,'1'); assert.equal(updated.name,'Kept name');
      await assert.rejects(inventory.remove('materials',a.id,updated.version),{status:409});
      await applied(operation('remove',[item(a,'1')]));
      const zero=await inventory.findMaterial(a.id);
      await assert.rejects(inventory.remove('materials',a.id,zero.version),error=>['23001','23503'].includes(error.code));
      assert.equal((await inventory.listMovements({},a.id)).data.length,2);
      await assert.rejects(inventory.update('materials',a.id,{quantity:'99'},zero.version),{status:422});
    });

    await t.test('a concurrent committed deletion makes a waiting stock operation fail atomically', async () => {
      const a=await material(),b=await material(); const blocker=await db.pool.connect();
      let pending;
      const body=operation('add',[item(a,'1'),item(b,'1')]);
      try {
        await blocker.query('BEGIN'); await blocker.query('DELETE FROM public.materials WHERE id=$1',[a.id]);
        pending=post(body); await waitForRowLock(); await blocker.query('COMMIT');
        assert.equal((await pending).status,404); assert.equal(await stock(b),'0'); await assertNoOperation(body.operationId);
      } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
    });

    await t.test('a stock operation holding row locks wins over a waiting stale deletion', async () => {
      const a=await material(); let entered, resume;
      const locked=new Promise(done=>{entered=done;}); const proceed=new Promise(done=>{resume=done;});
      const paused=createInventoryRepository({connect:async()=>{
        const connection=await db.pool.connect();
        return {query:async(sql,values)=>{const result=await connection.query(sql,values);if(sql.includes('ORDER BY id FOR UPDATE')){entered();await proceed;}return result;},release:discard=>connection.release(discard)};
      }});
      const applying=paused.operateStock(operation('add',[item(a,'1')]),1);
      let removing;
      try {
        await locked;
        removing=inventory.remove('materials',a.id,a.version).then(()=>null,error=>error);
        await waitForRowLock(); resume();
        assert.equal((await applying).replayed,false);
        assert.equal((await removing).status,409); assert.equal(await stock(a),'1');
      } finally {resume();await applying;if(removing)await removing;}
    });

    await t.test('a concurrent metadata update is preserved by a waiting stock addition', async () => {
      const a=await material(); const blocker=await db.pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('UPDATE public.materials SET name=$1 WHERE id=$2',['Changed during race',a.id]);
        pending=post(operation('add',[item(a,'0.125')])); await waitForRowLock(); await blocker.query('COMMIT');
        assert.equal((await pending).status,201);
        const fresh=await inventory.findMaterial(a.id); assert.equal(fresh.name,'Changed during race'); assert.equal(fresh.quantity,'0.125');
      } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
    });

    await t.test('SQL-looking reasons remain inert, history exposes only safe fields and orders newest first', async () => {
      const a=await material('History material');
      const body=operation('add',[item(a,'2.5')],{reason:"وسایل '); DROP TABLE materials; --"});
      await applied(body); await applied(operation('remove',[item(a,'0.125')]));
      const history=await inventory.listMovements({limit:'10'},a.id);
      assert.equal(history.data.length,2); assert.equal(history.data[0].quantityDelta,'-0.125'); assert.equal(history.data[0].type,'remove');
      assert.equal(history.data[1].reason,body.reason); assert.equal(history.data[1].materialName,'History material');
      assert.deepEqual(Object.keys(history.data[0]).sort(),['createdAt','id','materialId','materialName','operationId','quantityDelta','reason','type']);
      const http=await client.request(`/api/materials/${a.id}/movements?limit=1`);
      assert.equal(http.status,200); const payload=await http.json(); assert.equal(payload.data.length,1); assert.ok(payload.page.nextCursor);
      const next=await (await client.request(`/api/materials/${a.id}/movements?limit=1&before=${payload.page.nextCursor}`)).json();
      assert.equal(next.data[0].quantityDelta,'2.5'); assert.equal(next.page.nextCursor,null);
      const empty=await material(); assert.deepEqual((await inventory.listMovements({},empty.id)).data,[]);
      assert.equal((await client.request(`/api/materials/${randomUUID()}/movements`)).status,404);
    });

    await t.test('cursor pagination handles equal timestamps and exact microseconds without missing or duplicating movements', async () => {
      const a=await material(),b=await material(),c=await material();
      const body=operation('add',[item(a,'1'),item(b,'1'),item(c,'1')]); await applied(body);
      // Test fixture timestamp overrides in the disposable database only.
      await db.owner.query("UPDATE public.stock_movements SET created_at='2030-01-01T00:00:00.123456Z' WHERE operation_id=$1",[body.operationId]);
      await db.owner.query("UPDATE public.stock_movements SET created_at='2030-01-01T00:00:00.123123Z' WHERE operation_id=$1 AND material_id=$2",[body.operationId,c.id]);
      const expected=(await db.pool.query('SELECT id FROM public.stock_movements ORDER BY created_at DESC,id DESC')).rows.map(row=>row.id);
      const received=[];let before;
      do {
        const page=await inventory.listMovements({limit:'2',...(before?{before}:{})});
        received.push(...page.data.map(row=>row.id)); before=page.page.nextCursor;
        assert.ok(received.length<=expected.length);
      } while(before);
      assert.deepEqual(received,expected); assert.equal(new Set(received).size,expected.length);
    });

    await t.test('history cursors do not repeat newer records inserted between pages', async () => {
      const page=await inventory.listMovements({limit:'1'});
      const a=await material();const body=operation('add',[item(a,'1')]);await applied(body);
      await db.owner.query("UPDATE public.stock_movements SET created_at='2031-01-01T00:00:00Z' WHERE operation_id=$1",[body.operationId]);
      const next=await inventory.listMovements({limit:'100',before:page.page.nextCursor});
      assert.ok(!next.data.some(row=>row.id===page.data[0].id||row.operationId===body.operationId));
    });

    await t.test('stock balances equal the exact sum of committed movements and all connections/transactions are released', async () => {
      const inconsistent=await db.pool.query(`SELECT m.id FROM public.materials m LEFT JOIN public.stock_movements sm ON sm.material_id=m.id
        GROUP BY m.id HAVING m.current_stock <> COALESCE(sum(sm.quantity_delta),0)`);
      assert.deepEqual(inconsistent.rows,[]);
      assert.equal(db.pool.waitingCount,0); assert.equal(db.pool.idleCount,db.pool.totalCount);
      assert.equal((await db.owner.query("SELECT count(*) FROM pg_stat_activity WHERE datname='inventory_api_test' AND state='idle in transaction'")).rows[0].count,'0');
    });
  } finally {if(fixture)await fixture.close();await db.close();}
});
