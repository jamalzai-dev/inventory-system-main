import DB from "./db.js";
import utils from "./utils.js";
const {
  formatCurrency,
  showToast,
  generateNextId,
  logAction,
  confirmDelete,
  ACTIONS,
} = utils;
import { injectPageContent } from "./navbar.js";

///////
let filtCat = document.querySelector(".filter-select-cat");
let filtStat = document.querySelector(".filter-select-status");
let editCat = document.getElementById("dialog-select-cat-edit");
let editSupp = document.getElementById("dialog-select-supp-edit");
//////////
let products = [];
let filteredProducts = [];
let suppliers = [];
let categories = [];
let currPage = 1;
const itemsPerPage = 5;
const getProductStatus = (product) => {
  if (product.quantity === 0) return "Out of Stock";
  if (product.quantity <= product.reorderLevel) return "Low Stock";
  return "In Stock";
};
const getStatusClass = (status) => {
  const map = {
    "In Stock": "istock",
    "Low Stock": "lstock",
    "Out of Stock": "ostock",
  };
  return map[status] ?? "";
};
const getSupplier = (supplierId) => {
  return suppliers.find((supplier) => supplier.id === supplierId);
};
const getSupplierId = (name) => {
  let supp = suppliers.find((supplier) => supplier.name === name);
  return supp.id;
};

const getCategory = (categoryId) => {
  return categories.find((category) => category.id === categoryId);
};
const getCategoryId = (name) => {
  let cat = categories.find((category) => category.name === name);
  return cat.id;
};
const populate = () => {
  if (DB.getProducts().length === 0) {
    DB.seed();
  }
  products = DB.getProducts();
  filteredProducts = [...products];
  suppliers = DB.getSuppliers();
  categories = DB.getCategories();
  ///////////////
  document.getElementById("total-prods").textContent = products.length;
  let lowStock = 0;
  let outStock = 0;
  let totVal = 0;
  products.forEach((prod) => {
    if (getProductStatus(prod) === "Low Stock") lowStock++;
    if (getProductStatus(prod) === "Out of Stock") outStock++;
    totVal += prod.price * prod.quantity;
  });
  document.getElementById("low-stock").textContent = lowStock;
  document.getElementById("out-stock").textContent = outStock;
  document.getElementById("total-value").textContent = formatCurrency(totVal);
  // totVal.toLocaleString();
  //////////////////////
  let selectCat = document.getElementById("dialog-select-cat");
  let selectSupp = document.getElementById("dialog-select-supp");

  selectCat.innerHTML = "<option>Select Category</option>";
  selectSupp.innerHTML = "<option>Select Supplier</option>";
  filtCat.innerHTML = "<option value='all'>Category: All</option>";
  editCat.innerHTML = "<option>Select Category</option>";
  editSupp.innerHTML = "<option>Select Supplier</option>";

  categories.forEach((cat) => {
    selectCat.appendChild(createOption(cat.name));
    filtCat.appendChild(createOption(cat.name));
    editCat.appendChild(createOption(cat.name));
  });

  suppliers.forEach((supp) => {
    if (supp.deleted === false) {
      selectSupp.appendChild(createOption(supp.name));
      editSupp.appendChild(createOption(supp.name));
    }
  });
  ///////////////////////////
  renderProducts(products);
};
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
  populate();
});

document.querySelector(".add-prod-dialog").addEventListener("click", (e) => {
  e.preventDefault();

  let name = document.getElementById("dialog-prod-name");
  let sku = document.getElementById("dialog-sku");
  if (products.find((p) => p.sku === sku.value)) {
    showToast("sku already exits please choose a unique sku", "error");
    // alert("sku already exits please choose a unique sku");
    return;
  }
  let price = document.getElementById("dialog-price");
  let category = document.getElementById("dialog-select-cat");

  let supplier = document.getElementById("dialog-select-supp");

  let quantity = document.getElementById("dialog-quantity");
  let reorder = document.getElementById("dialog-reorder");

  if (
    !name.value ||
    !sku.value ||
    !price.value ||
    category.value === "Select Category" ||
    supplier.value === "Select Supplier"
  ) {
    showToast("Please fill all fields", "error");
    // alert("Please fill all fields");
    return;
  }

  if (
    Number(reorder.value) < 0 ||
    Number(quantity.value) < 0 ||
    Number(price.value) <= 0
  ) {
    showToast("please enter valid numeric value", "error");
    // alert("please enter valid numeric value");
    return;
  }
  let catId = getCategoryId(category.value);
  let suppId = getSupplierId(supplier.value);
  let now = new Date();

  let newProd = {
    id: generateNextId(products, "prod"),
    sku: sku.value,
    name: name.value,
    categoryId: catId,
    supplierId: suppId,
    price: Number(price.value),
    quantity: Number(quantity.value),
    reorderLevel: Number(reorder.value),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  DB.addProduct(newProd);
  populate();
  dialog.close();
  logAction(
    ACTIONS.PRODUCT_ADDED,
    `product ${name.value} with the sku: ${sku.value} has been added`,
  );
  name.value = "";
  sku.value = "";
  price.value = "";
  category.value = "Select Category";
  supplier.value = "Select Supplier";
  quantity.value = 0;
  reorder.value = 10;
});

let renderProducts = (products) => {
  let start = (currPage - 1) * itemsPerPage;
  let end = start + itemsPerPage;
  let pageProducts = products.slice(start, end);
  let div = document.querySelector(".datarows");
  div.innerHTML = "";
  if (pageProducts.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="6" class="text-center text-muted">No products found</td>
    </tr>`;
    renderPagination(products);
    return;
  }
  pageProducts.forEach((prod) => {
    if (!getCategory(prod.categoryId) || !getSupplier(prod.supplierId)) {
      return;
    }
    const status = getProductStatus(prod);
    let html = `<tr>
      <td><code>${prod.sku}</code></td>
      <td>
        
        ${prod.name}
      </td>
      <td>${getCategory(prod.categoryId).name}</td>
      <td>${prod.quantity} units</td>
      <td>
        <span class="${getStatusClass(status)} btn btn-sm rounded-pill">
          ${status}
        </span>
      </td>
      <td>
        <button class="edit-btn" data-id="${prod.id}" title="Edit">
          <i class="fa-regular fa-pen-to-square"></i>
        </button>
        <button class="delete-btn" data-id="${prod.id}" title="Delete">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </td>
    </tr>`;
    div.insertAdjacentHTML("beforeend", html);
  });

  renderPagination(products);
};
///////////////////////
const searchBox = document.querySelector(".search-input");
searchBox.addEventListener("input", (e) => {
  const query = searchBox.value.toLowerCase();

  const catVal = filtCat.value;
  const statVal = filtStat.value;

  filteredProducts = products.filter((prod) => {
    const catMatch =
      catVal === "all" || getCategory(prod.categoryId)?.name === catVal;
    const statMatch = statVal === "all" || getProductStatus(prod) === statVal;
    const searchMatch =
      prod.sku.toLowerCase().includes(query) ||
      prod.name.toLowerCase().includes(query) ||
      getCategory(prod.categoryId)?.name?.toLowerCase().includes(query);
    return catMatch && statMatch && searchMatch;
  });

  currPage = 1;
  renderProducts(filteredProducts);
});
////////////////////////
const applyFilters = () => {
  const catVal = filtCat.value;
  const statVal = filtStat.value;

  filteredProducts = products.filter((prod) => {
    const catMatch =
      catVal === "all" || getCategory(prod.categoryId).name === catVal;
    const statMatch = statVal === "all" || getProductStatus(prod) === statVal;
    return catMatch && statMatch;
  });

  currPage = 1;
  renderProducts(filteredProducts);
};

//////
filtCat.addEventListener("change", applyFilters);

//////////////////////
filtStat.addEventListener("change", applyFilters);

//////////////////////////////////
const renderPagination = (products) => {
  let totalPages = Math.ceil(products.length / itemsPerPage);
  let start = (currPage - 1) * itemsPerPage + 1;
  let end = Math.min(currPage * itemsPerPage, products.length);

  document.getElementById("pagination-results").textContent =
    `Showing ${start}-${end} of ${products.length} results`;

  if (currPage === 1) {
    document.getElementById("previous-btn").disabled = true;
  } else document.getElementById("previous-btn").disabled = false;

  if (currPage === totalPages) {
    document.getElementById("next-btn").disabled = true;
  } else document.getElementById("next-btn").disabled = false;
};
document.getElementById("previous-btn").addEventListener("click", () => {
  if (currPage > 1) {
    currPage--;
    renderProducts(filteredProducts);
  }
});

document.getElementById("next-btn").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  if (currPage < totalPages) {
    currPage++;
    renderProducts(filteredProducts);
  }
});
document.querySelector("body").addEventListener("click", (e) => {
  if (e.target.closest(".edit-btn")) {
    const id = e.target.closest(".edit-btn").dataset.id;
    const product = products.find((p) => p.id === id);
    if (!product) return;

    document.getElementById("editDialog").dataset.editId = product.id;
    document.getElementById("dialog-edit-name").value = product.name;
    document.getElementById("dialog-edit-sku").value = product.sku;
    document.getElementById("dialog-edit-price").value = product.price;
    editCat.value = getCategory(product.categoryId)?.name;
    editSupp.value = getSupplier(product.supplierId)?.name;
    document.getElementById("edit-current-qty").textContent = product.quantity;
    document.getElementById("dialog-reorder-edit").value = product.reorderLevel;
    editDialog.showModal();
    return;
  }

  if (e.target.closest(".delete-btn")) {
    const id = e.target.closest(".delete-btn").dataset.id;
    const product = products.find((p) => p.id === id);
    if (!product) return;
    if (confirmDelete(product.name)) {
      DB.deleteProduct(id);
      populate();
      logAction(
        ACTIONS.PRODUCT_DELETED,
        `product "${product.name}" has been deleted`,
      );
    }
  }
});
document.querySelector(".edit-dialog").addEventListener("click", (e) => {
  let id = document.getElementById("editDialog").dataset.editId;

  let name = document.getElementById("dialog-edit-name").value;
  let sku = document.getElementById("dialog-edit-sku").value;
  let price = document.getElementById("dialog-edit-price").value;

  let reorder = document.getElementById("dialog-reorder-edit").value;
  let isSku = products.find((el) => el.sku === sku && el.id !== id);

  if (isSku) {
    showToast("sku must be unique", "error");
    // alert("sku must be unique");
    return;
  }

  if (
    !name ||
    !sku ||
    !price ||
    editCat.value === "Select Category" ||
    editSupp.value === "Select Supplier"
  ) {
    showToast("Please fill all fields", "error");
    // alert("");
    return;
  }
  if (Number(reorder) < 0 || Number(price) <= 0) {
    showToast("please enter valid numeric value", "error");
    // alert("please enter valid numeric value");
    return;
  }

  DB.updateProduct(id, {
    name,
    sku,
    price: Number(price),

    reorderLevel: Number(reorder),
    categoryId: getCategoryId(editCat.value),
    supplierId: getSupplierId(editSupp.value),
  });
  currPage = 1;
  populate();
  editDialog.close();
  logAction(ACTIONS.PRODUCT_UPDATED, `product ${id} has been updated`);
});

const createOption = (value) => {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  return option;
};
