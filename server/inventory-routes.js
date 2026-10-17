import { Router } from 'express';
import { validMaterialId } from './inventory.js';

// Mount only after the existing Admin/session authentication middleware.
export function createInventoryRouter(inventory) {
  const router = Router();
  router.get('/categories', async (req, res) => res.json({ data: await inventory.listCategories() }));
  router.get('/suppliers', async (req, res) => res.json({ data: await inventory.listSuppliers() }));
  router.get('/materials', async (req, res) => res.json({ data: await inventory.listMaterials() }));
  router.get('/materials/:id', async (req, res) => {
    if (!validMaterialId(req.params.id)) return res.status(400).json({ error: 'Invalid material ID.' });
    const material = await inventory.findMaterial(req.params.id);
    if (!material) return res.status(404).json({ error: 'Material not found.' });
    res.json({ data: material });
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    // Never include raw driver messages, SQL, credentials or records in logs/responses.
    console.error('Inventory read unavailable. Check PostgreSQL and inventory read permissions.');
    res.status(503).json({ error: 'Service temporarily unavailable.' });
  });
  return router;
}
