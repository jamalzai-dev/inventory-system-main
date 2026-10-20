import { Router } from 'express';
import { validMaterialId } from './inventory.js';
import { InventoryApiError, recordId, expectedVersion, requestKey } from './inventory-validation.js';

// Mount only after the existing Admin/session authentication middleware.
export function createInventoryRouter(inventory, csrf) {
  const router = Router();
  router.get('/categories', async (req, res) => res.json({ data: await inventory.listCategories() }));
  router.get('/suppliers', async (req, res) => res.json({ data: await inventory.listSuppliers() }));
  router.get('/materials', async (req, res) => res.json({ data: await inventory.listMaterials() }));
  router.get('/stock-movements', async (req, res) => res.json(await inventory.listMovements(req.query)));
  router.get('/materials/:id/movements', async (req, res) => res.json(await inventory.listMovements(req.query, recordId(req.params.id))));
  router.post('/stock-operations', csrf, async (req, res) => {
    res.locals.inventoryAction = 'stock';
    const result = await inventory.operateStock(req.body, req.session.admin.id);
    res.status(result.replayed ? 200 : 201).json({ data: result });
  });
  router.get('/materials/:id', async (req, res) => {
    if (!validMaterialId(req.params.id)) return res.status(400).json({ error: 'Invalid material ID.' });
    const material = await inventory.findMaterial(req.params.id);
    if (!material) return res.status(404).json({ error: 'Material not found.' });
    res.json({ data: material });
  });
  for (const resource of ['categories', 'suppliers', 'materials']) {
    router.post(`/${resource}`, csrf, async (req, res) => {
      res.locals.inventoryAction = 'create';
      res.status(201).json({ data: await inventory.create(resource, req.body, requestKey(req.get('Idempotency-Key'))) });
    });
    router.patch(`/${resource}/:id`, csrf, async (req, res) => {
      res.locals.inventoryAction = 'update';
      res.json({ data: await inventory.update(resource, recordId(req.params.id), req.body, expectedVersion(req.get('If-Match'))) });
    });
    router.delete(`/${resource}/:id`, csrf, async (req, res) => {
      res.locals.inventoryAction = 'delete';
      if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
        throw new InventoryApiError(422, 'DELETE requests must not contain fields.');
      }
      await inventory.remove(resource, recordId(req.params.id), expectedVersion(req.get('If-Match')));
      res.status(204).end();
    });
  }
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof InventoryApiError) return res.status(error.status).json({ error: error.message });
    if (error instanceof URIError) return res.status(400).json({ error: 'Invalid record ID.' });
    if (res.locals.inventoryAction === 'stock' && ['23503', '23505', '23001'].includes(error.code)) {
      return res.status(409).json({ error: 'A stock operation conflict prevented confirmation. Retry with the same operationId and unchanged request.' });
    }
    if (error.code === '23505') {
      const messages = {
        categories_normalized_name_unique: 'A category with this name already exists.',
        suppliers_normalized_name_unique: 'A supplier with this name already exists.',
        materials_serial_normalized_unique: 'A material with this serial number already exists.'
      };
      return res.status(409).json({ error: Object.hasOwn(messages, error.constraint) ? messages[error.constraint] : 'This value already exists.' });
    }
    if (error.code === '23001') return res.status(409).json({ error: 'This record is in use and cannot be deleted.' });
    if (error.code === '23503') return res.status(res.locals.inventoryAction === 'delete' ? 409 : 422).json({
      error: res.locals.inventoryAction === 'delete' ? 'This record is in use and cannot be deleted.' : 'The selected category or supplier does not exist.'
    });
    if (['23514', '23502', '22003', '22007', '22008', '22P02'].includes(error.code)) return res.status(422).json({ error: 'A supplied value does not meet inventory constraints.' });
    if (['40001', '40P01'].includes(error.code)) return res.status(409).json({ error: 'A concurrent change prevented this request. Reload before retrying.' });
    // Never include raw driver messages, SQL, credentials or records in logs/responses.
    console.error('Inventory service unavailable. Check PostgreSQL, migrations and permissions.');
    res.status(503).json({ error: res.locals.inventoryAction === 'stock'
      ? 'Stock operation could not be confirmed. Retry with the same operationId and unchanged request.'
      : 'Service temporarily unavailable.' });
  });
  return router;
}
