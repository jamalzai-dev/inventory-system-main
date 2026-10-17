const DB = {
  // Private helpers for getters and setters
  //* gets the item from the localStorage using the selected key if not exists returns empty array
  _get(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
  },

  //*Sets a new item to the localStorage using the key and data passed
  _set(key, data) {
    throw new Error("Legacy inventory is read-only. Use index.html and export the legacy archive before migration.");
  },

  //~ Categories => localStorage key: "ims_categories" | ops: get, save, add, update, delete
  getCategories() {
    return this._get("ims_categories");
  },

  saveCategories(data) {
    return this._set("ims_categories", data);
  },

  addCategory(category) {
    const list = this.getCategories();
    list.push(category);
    this.saveCategories(list);
  },

  updateCategory(id, updates) {
    const list = this.getCategories().map((category) => {
      return category.id === id ? { ...category, ...updates } : category;
    });
    this.saveCategories(list);
  },

  deleteCategory(id) {
    this.saveCategories(
      this.getCategories().filter((category) => category.id !== id),
    );
  },

  //^ Suppliers => localStorage key: "ims_suppliers" | ops: get, save, add, update, delete
  getSuppliers() {
    return this._get("ims_suppliers");
  },

  saveSuppliers(data) {
    return this._set("ims_suppliers", data);
  },

  addSupplier(supplier) {
    const list = this.getSuppliers();
    list.push(supplier);
    this.saveSuppliers(list);
  },

  updateSupplier(id, updates) {
    const list = this.getSuppliers().map((supplier) => {
      return supplier.id === id ? { ...supplier, ...updates } : supplier;
    });
    this.saveSuppliers(list);
  },

  deleteSupplier(id) {
    this.saveSuppliers(
      this.getSuppliers().filter((supplier) => supplier.id !== id),
    );
  },

  //& Products => localStorage key: "ims_products" | ops: get, save, add, update, delete
  getProducts() {
    return this._get("ims_products");
  },

  saveProducts(data) {
    this._set("ims_products", data);
  },

  addProduct(product) {
    const list = this.getProducts();
    list.push(product);
    this.saveProducts(list);
  },

  updateProduct(id, updates) {
    const list = this.getProducts().map((product) => {
      return product.id === id
        ? { ...product, ...updates, updatedAt: new Date().toISOString() }
        : product;
    });
    this.saveProducts(list);
  },

  deleteProduct(id) {
    this.saveProducts(
      this.getProducts().filter((product) => product.id !== id),
    );
  },

  //^ Purchase Orders => localStorage key: "ims_orders" | ops: get, save, add, update
  getOrders() {
    return this._get("ims_orders");
  },

  saveOrders(data) {
    return this._set("ims_orders", data);
  },

  addOrder(order) {
    const list = this.getOrders();
    list.push(order);
    this.saveOrders(list);
  },

  updateOrder(id, updates) {
    const list = this.getOrders().map((order) => {
      return order.id === id ? { ...order, ...updates } : order;
    });
    this.saveOrders(list);
  },

  //~ Stock Adjustments => localStorage key: "ims_adjustments" | ops: get, save, add

  getAdjustments() {
    return this._get("ims_adjustments");
  },

  saveAdjustments(data) {
    return this._set("ims_adjustments", data);
  },

  addAdjustment(adjustment) {
    const list = this.getAdjustments();
    list.push(adjustment);
    this.saveAdjustments(list);
  },

  //^ Activity log => localStorage key: "ims_log" | ops: get, save, add
  getLog() {
    return this._get("ims_log");
  },

  saveLog(data) {
    return this._set("ims_log", data);
  },

  addLog(entry) {
    const list = this.getLog();
    list.push(entry);
    this.saveLog(list);
  },

  //* SEED DATA *
  //* ALL IDs, SKUs, FKs, and values
  seed() {
    return; // Retired: automatic sample seeding must never overwrite real data.

    //~ only seed if ALL collections are empty, never otherwise
    // if(this.getCategories().length > 0 ||
    //    this.getAdjustments().length > 0 ||
    //    this.getProducts().length > 0 ||
    //    this.getSuppliers().length > 0 ||
    //    this.getOrders().length > 0 ||
    //    this.getLog().length > 0) {
    //     console.log("Data already exists, skipping seed!");
    //     return;
    //    }
    //~ Categories
    this.saveCategories([
      {
        id: "cat_001",
        name: "Electronics",
        description: "Electronics devices and Accessories",
        createdAt: "2026-03-15T09:00:00.000Z",
      },
      {
        id: "cat_002",
        name: "Office Supplies",
        description: "Office and stationery items",
        createdAt: "2026-03-15T09:01:00.000Z",
      },
      {
        id: "cat_003",
        name: "Furniture",
        description: "Office and Home furniture",
        createdAt: "2026-03-15T09:02:00.000Z",
      },
      {
        id: "cat_004",
        name: "Networking",
        description: "Networking related items",
        createdAt: "2026-03-15T09:03:00.000Z",
      },
    ]);

    //^ Suppliers
    this.saveSuppliers([
      {
        id: "sup_001",
        name: "TechWorld Ltd",
        contact: "Ahmed Hassan",
        phone: "01000000001",
        email: "ahmed@techworld.com",
        address: "12 Nile St, Cairo",
        createdAt: "2026-03-12T09:05:00.000Z",
        deleted: false,
      },
      {
        id: "sup_002",
        name: "OfficeHub Egypt",
        contact: "Sara Mahmoud",
        phone: "01100000002",
        email: "sara@officehub.eg",
        address: "45 Tahrir Ave, Giza",
        createdAt: "2026-03-12T09:06:00.000Z",
        deleted: false,
      },
      {
        id: "sup_003",
        name: "NetGear Arabia",
        contact: "Omar Khalil",
        phone: "01220000003",
        email: "omar@netgear-arabia.com",
        address: "7 Smart Village, 6th of October",
        createdAt: "2026-03-12T09:07:00.000Z",
        deleted: false,
      },
      {
        id: "sup_004",
        name: "FurniCo",
        contact: "Layla Nour",
        phone: "01000000004",
        email: "layla@furnico.com",
        address: "88 Industrial Zone, Alexandria",
        createdAt: "2026-03-12T09:08:00.000Z",
        deleted: false,
      },
    ]);

    //& Products
    this.saveProducts([
      {
        id: "prod_001",
        sku: "ELEC-001",
        name: "Wireless Mouse",
        categoryId: "cat_001",
        supplierId: "sup_001",
        price: 149.99,
        quantity: 50,
        reorderLevel: 10,
        createdAt: "2026-03-12T09:10:00.000Z",
        updatedAt: "2026-03-12T09:10:00.000Z",
      },
      {
        id: "prod_002",
        sku: "ELEC-002",
        name: "Mechanical Keyboard",
        categoryId: "cat_001",
        supplierId: "sup_001",
        price: 349.99,
        quantity: 30,
        reorderLevel: 8,
        createdAt: "2026-03-12T09:11:00.000Z",
        updatedAt: "2026-03-12T09:11:00.000Z",
      },
      {
        id: "prod_003",
        sku: "ELEC-003",
        name: '27" LED Monitor',
        categoryId: "cat_001",
        supplierId: "sup_001",
        price: 1899.99,
        quantity: 7,
        reorderLevel: 5,
        createdAt: "2026-03-12T09:12:00.000Z",
        updatedAt: "2026-03-12T09:12:00.000Z",
      },
      {
        id: "prod_004",
        sku: "ELEC-004",
        name: "USB-C Hub (7-in-1)",
        categoryId: "cat_001",
        supplierId: "sup_001",
        price: 229.99,
        quantity: 4,
        reorderLevel: 10,
        createdAt: "2026-03-12T09:13:00.000Z",
        updatedAt: "2026-03-12T09:13:00.000Z",
      },
      {
        id: "prod_005",
        sku: "OFFC-001",
        name: "A4 Copy Paper (500 sheets)",
        categoryId: "cat_002",
        supplierId: "sup_002",
        price: 45.0,
        quantity: 200,
        reorderLevel: 50,
        createdAt: "2026-03-12T09:14:00.000Z",
        updatedAt: "2026-03-12T09:14:00.000Z",
      },
      {
        id: "prod_006",
        sku: "OFFC-002",
        name: "Ballpoint Pens (Box of 50)",
        categoryId: "cat_002",
        supplierId: "sup_002",
        price: 35.0,
        quantity: 80,
        reorderLevel: 20,
        createdAt: "2026-03-12T09:15:00.000Z",
        updatedAt: "2026-03-12T09:15:00.000Z",
      },
      {
        id: "prod_007",
        sku: "OFFC-003",
        name: "Stapler",
        categoryId: "cat_002",
        supplierId: "sup_002",
        price: 55.0,
        quantity: 9,
        reorderLevel: 10,
        createdAt: "2026-03-12T09:16:00.000Z",
        updatedAt: "2026-03-12T09:16:00.000Z",
      },
      {
        id: "prod_008",
        sku: "NET-001",
        name: "Wireless Router (AC1200)",
        categoryId: "cat_004",
        supplierId: "sup_003",
        price: 599.99,
        quantity: 15,
        reorderLevel: 5,
        createdAt: "2026-03-12T09:17:00.000Z",
        updatedAt: "2026-03-12T09:17:00.000Z",
      },
      {
        id: "prod_009",
        sku: "NET-002",
        name: "Cat6 Ethernet Cable (10m)",
        categoryId: "cat_004",
        supplierId: "sup_003",
        price: 49.99,
        quantity: 3,
        reorderLevel: 15,
        createdAt: "2026-03-12T09:18:00.000Z",
        updatedAt: "2026-03-12T09:18:00.000Z",
      },
      {
        id: "prod_010",
        sku: "FURN-001",
        name: "Ergonomic Office Chair",
        categoryId: "cat_003",
        supplierId: "sup_004",
        price: 2499.99,
        quantity: 12,
        reorderLevel: 3,
        createdAt: "2026-03-12T09:19:00.000Z",
        updatedAt: "2026-03-12T09:19:00.000Z",
      },
      {
        id: "prod_011",
        sku: "FURN-002",
        name: "Standing Desk (120cm)",
        categoryId: "cat_003",
        supplierId: "sup_004",
        price: 3199.99,
        quantity: 2,
        reorderLevel: 3,
        createdAt: "2026-03-12T09:20:00.000Z",
        updatedAt: "2026-03-12T09:20:00.000Z",
      },
    ]);

    //^ Purchase Orders
    this.saveOrders([
      {
        id: "po_001",
        poNumber: "PO-0001",
        supplierId: "sup_001",
        status: "Received",
        items: [
          { productId: "prod_001", quantity: 20, unitPrice: 130.0 },
          { productId: "prod_002", quantity: 10, unitPrice: 300.0 },
        ],
        totalValue: 5600.0,
        createdAt: "2026-03-12T10:00:00.000Z",
        expectedDate: "2026-04-05",
        receivedAt: "2026-03-13T11:00:00.000Z",
      },
      {
        id: "po_002",
        poNumber: "PO-0002",
        supplierId: "sup_002",
        status: "Received",
        items: [
          { productId: "prod_005", quantity: 100, unitPrice: 40.0 },
          { productId: "prod_006", quantity: 30, unitPrice: 28.0 },
        ],
        totalValue: 4840.0,
        createdAt: "2026-03-12T10:30:00.000Z",
        expectedDate: "2026-04-05",
        receivedAt: "2026-03-13T14:00:00.000Z",
      },
      {
        id: "po_003",
        poNumber: "PO-0003",
        supplierId: "sup_003",
        status: "Pending",
        items: [
          { productId: "prod_009", quantity: 25, unitPrice: 42.0 },
          { productId: "prod_008", quantity: 5, unitPrice: 520.0 },
        ],
        totalValue: 3650.0,
        createdAt: "2026-03-14T09:00:00.000Z",
        expectedDate: "2026-04-05",
        receivedAt: null,
      },
      {
        id: "po_004",
        poNumber: "PO-0004",
        supplierId: "sup_004",
        status: "Pending",
        items: [{ productId: "prod_011", quantity: 3, unitPrice: 2800.0 }],
        totalValue: 8400.0,
        createdAt: "2026-03-14T10:00:00.000Z",
        expectedDate: "2026-04-05",
        receivedAt: null,
      },
    ]);

    //~ Stock Adjustments
    this.saveAdjustments([
      {
        id: "adj_001",
        productId: "prod_003",
        type: "subtract",
        quantity: 3,
        reason: "Damaged in storage",
        createdAt: "2026-03-13T08:00:00.000Z",
      },
      {
        id: "adj_002",
        productId: "prod_004",
        type: "subtract",
        quantity: 6,
        reason: "Lost during warehouse move",
        createdAt: "2026-03-13T08:30:00.000Z",
      },
      {
        id: "adj_003",
        productId: "prod_009",
        type: "subtract",
        quantity: 12,
        reason: "Defective batch returned to supplier",
        createdAt: "2026-03-13T09:00:00.000Z",
      },
      {
        id: "adj_004",
        productId: "prod_011",
        type: "subtract",
        quantity: 1,
        reason: "Showroom display unit written off",
        createdAt: "2026-03-13T09:30:00.000Z",
      },
      {
        id: "adj_005",
        productId: "prod_007",
        type: "subtract",
        quantity: 1,
        reason: "Miscounted during last inventory audit",
        createdAt: "2026-03-14T07:00:00.000Z",
      },
    ]);

    //^ Activity Log
    this.saveLog([
      {
        id: "log_001",
        action: "CATEGORY_ADDED",
        message: "Added category: Electronics",
        createdAt: "2026-03-12T09:00:00.000Z",
      },
      {
        id: "log_002",
        action: "CATEGORY_ADDED",
        message: "Added category: Office Supplies",
        createdAt: "2026-03-12T09:01:00.000Z",
      },
      {
        id: "log_003",
        action: "CATEGORY_ADDED",
        message: "Added category: Furniture",
        createdAt: "2026-03-12T09:02:00.000Z",
      },
      {
        id: "log_004",
        action: "CATEGORY_ADDED",
        message: "Added category: Networking",
        createdAt: "2026-03-12T09:03:00.000Z",
      },
      {
        id: "log_005",
        action: "SUPPLIER_ADDED",
        message: "Added supplier: TechWorld Ltd",
        createdAt: "2026-03-12T09:05:00.000Z",
      },
      {
        id: "log_006",
        action: "SUPPLIER_ADDED",
        message: "Added supplier: OfficeHub Egypt",
        createdAt: "2026-03-12T09:06:00.000Z",
      },
      {
        id: "log_007",
        action: "SUPPLIER_ADDED",
        message: "Added supplier: NetGear Arabia",
        createdAt: "2026-03-12T09:07:00.000Z",
      },
      {
        id: "log_008",
        action: "SUPPLIER_ADDED",
        message: "Added supplier: FurniCo",
        createdAt: "2026-03-12T09:08:00.000Z",
      },
      {
        id: "log_009",
        action: "PRODUCT_ADDED",
        message: "Added product: Wireless Mouse (SKU: ELEC-001)",
        createdAt: "2026-03-12T09:10:00.000Z",
      },
      {
        id: "log_010",
        action: "PRODUCT_ADDED",
        message: "Added product: Mechanical Keyboard (SKU: ELEC-002)",
        createdAt: "2026-03-12T09:11:00.000Z",
      },
      {
        id: "log_011",
        action: "PRODUCT_ADDED",
        message: 'Added product: 27" LED Monitor (SKU: ELEC-003)',
        createdAt: "2026-03-12T09:12:00.000Z",
      },
      {
        id: "log_012",
        action: "PRODUCT_ADDED",
        message: "Added product: USB-C Hub (7-in-1) (SKU: ELEC-004)",
        createdAt: "2026-03-12T09:13:00.000Z",
      },
      {
        id: "log_013",
        action: "PRODUCT_ADDED",
        message: "Added product: A4 Copy Paper (500 sheets) (SKU: OFFC-001)",
        createdAt: "2026-03-12T09:14:00.000Z",
      },
      {
        id: "log_014",
        action: "PRODUCT_ADDED",
        message: "Added product: Ballpoint Pens (Box of 50) (SKU: OFFC-002)",
        createdAt: "2026-03-12T09:15:00.000Z",
      },
      {
        id: "log_015",
        action: "PRODUCT_ADDED",
        message: "Added product: Stapler (SKU: OFFC-003)",
        createdAt: "2026-03-12T09:16:00.000Z",
      },
      {
        id: "log_016",
        action: "PRODUCT_ADDED",
        message: "Added product: Wireless Router (AC1200) (SKU: NET-001)",
        createdAt: "2026-03-12T09:17:00.000Z",
      },
      {
        id: "log_017",
        action: "PRODUCT_ADDED",
        message: "Added product: Cat6 Ethernet Cable (10m) (SKU: NET-002)",
        createdAt: "2026-03-12T09:18:00.000Z",
      },
      {
        id: "log_018",
        action: "PRODUCT_ADDED",
        message: "Added product: Ergonomic Office Chair (SKU: FURN-001)",
        createdAt: "2026-03-12T09:19:00.000Z",
      },
      {
        id: "log_019",
        action: "PRODUCT_ADDED",
        message: "Added product: Standing Desk (120cm) (SKU: FURN-002)",
        createdAt: "2026-03-12T09:20:00.000Z",
      },
      {
        id: "log_020",
        action: "ORDER_CREATED",
        message:
          "Purchase order created: PO-0001 — TechWorld Ltd (EGP 5,600.00)",
        createdAt: "2026-03-12T10:00:00.000Z",
      },
      {
        id: "log_021",
        action: "ORDER_CREATED",
        message:
          "Purchase order created: PO-0002 — OfficeHub Egypt (EGP 4,840.00)",
        createdAt: "2026-03-12T10:30:00.000Z",
      },
      {
        id: "log_022",
        action: "ORDER_RECEIVED",
        message:
          "Purchase order received: PO-0001 — stock updated for 2 products",
        createdAt: "2026-03-13T11:00:00.000Z",
      },
      {
        id: "log_023",
        action: "ORDER_RECEIVED",
        message:
          "Purchase order received: PO-0002 — stock updated for 2 products",
        createdAt: "2026-03-13T14:00:00.000Z",
      },
      {
        id: "log_024",
        action: "STOCK_ADJUSTED",
        message:
          'Stock adjusted: 27" LED Monitor (SKU: ELEC-003) — subtract 3 — Damaged in storage',
        createdAt: "2026-03-13T08:00:00.000Z",
      },
      {
        id: "log_025",
        action: "STOCK_ADJUSTED",
        message:
          "Stock adjusted: USB-C Hub (7-in-1) (SKU: ELEC-004) — subtract 6 — Lost during warehouse move",
        createdAt: "2026-03-13T08:30:00.000Z",
      },
      {
        id: "log_026",
        action: "STOCK_ADJUSTED",
        message:
          "Stock adjusted: Cat6 Ethernet Cable (10m) (SKU: NET-002) — subtract 12 — Defective batch returned to supplier",
        createdAt: "2026-03-13T09:00:00.000Z",
      },
      {
        id: "log_027",
        action: "STOCK_ADJUSTED",
        message:
          "Stock adjusted: Standing Desk (120cm) (SKU: FURN-002) — subtract 1 — Showroom display unit written off",
        createdAt: "2026-03-13T09:30:00.000Z",
      },
      {
        id: "log_028",
        action: "STOCK_ADJUSTED",
        message:
          "Stock adjusted: Stapler (SKU: OFFC-003) — subtract 1 — Miscounted during last inventory audit",
        createdAt: "2026-03-14T07:00:00.000Z",
      },
      {
        id: "log_029",
        action: "ORDER_CREATED",
        message:
          "Purchase order created: PO-0003 — NetGear Arabia (EGP 3,650.00)",
        createdAt: "2026-03-14T09:00:00.000Z",
      },
      {
        id: "log_030",
        action: "ORDER_CREATED",
        message: "Purchase order created: PO-0004 — FurniCo (EGP 8,400.00)",
        createdAt: "2026-03-14T10:00:00.000Z",
      },
    ]);

    //^ Printing successfull loading to the console
    console.log(
      "%c IMS seed data loaded successfully!",
      "color: green; font-weight: bold",
    );
    console.log("Categories:", this.getCategories().length);
    console.log("Suppliers: ", this.getSuppliers().length);
    console.log("Products: ", this.getProducts().length);
    console.log("Orders: ", this.getOrders().length);
    console.log("Adjustments: ", this.getAdjustments().length);
    console.log("Log Enteries: ", this.getLog().length);
  },

  //^ CLEAR ALL DATA
  clear() {
    throw new Error("Legacy inventory is read-only; original records are preserved.");
  },
};

// DB.seed();

export default DB;
