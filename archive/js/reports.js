import DB from "./db.js";
import utils from "./utils.js";
import { injectPageContent } from "./navbar.js";
const { formatCurrency } = utils;
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
const getCategory = (categoryId) => {
  return categories.find((category) => category.id === categoryId);
};
const getCategoryId = (name) => {
  let cat = categories.find((category) => category.name === name);
  return cat.id;
};

let products = [];
let categories = [];
let supp = [];
let orders = [];
let adj = [];
let logs = [];
let currPage = 1;
const itemsPerPage = 5;
let lowStockContent;
let invValueContent;
let totalVal;
let lowStock;
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
  lowStockContent = document.querySelector(".low-stock-content");
  invValueContent = document.querySelector(".inv-value-content");

  populate(lowStockContent, invValueContent);
});
const populate = (container, invContainer) => {
  if (DB.getProducts().length === 0) {
    DB.seed();
  }
  products = DB.getProducts();
  categories = DB.getCategories();
  supp = DB.getSuppliers();
  orders = DB.getOrders();
  adj = DB.getAdjustments();
  logs = DB.getLog();
  renderLowStockReport(products, container);
  renderInventoryValue(products, invContainer);
  summary();
};
const renderLowStockReport = (products, container) => {
  lowStock = products.filter((prod) => prod.quantity <= prod.reorderLevel);
  if (lowStock.length === 0) {
    container.innerHTML = `<tr><td class="text-center text-success">
      All products are well stocked!
    </td></tr>`;
    return;
  }
  container
    .closest(".table")
    .querySelector("thead")
    .insertAdjacentHTML(
      "afterbegin",
      `<tr class="alert-low ms-5">
              <td> 
                <i class="fa-solid fa-triangle-exclamation" style="color: rgb(255, 212, 59)"></i>
                ${lowStock.length} item(s) at or below reorder level</td>
            </tr>`,
    );
  lowStock.forEach((prod) => {
    const status = getProductStatus(prod);

    let html = `<tr>
      <td>${prod.name}</td>
      <td><code>${prod.sku}</code></td>
      <td>${prod.quantity}</td>
      <td>${prod.reorderLevel}</td>
      <td><span class="badge ${getStatusClass(status) === "lstock" ? "bg-warning text-dark" : "bg-danger"}">${status}</span></td>
    </tr>`;
    container.insertAdjacentHTML("beforeend", html);
  });
};
const renderInventoryValue = (prods, container) => {
  totalVal = prods.reduce((acc, curr) => {
    return (acc += curr.quantity * curr.price);
  }, 0);
  let units = prods.reduce((acc, curr) => {
    return (acc += curr.quantity);
  }, 0);
  document.getElementById("total-value").textContent = formatCurrency(totalVal);
  document.getElementById("prods").textContent = prods.length;
  document.getElementById("units").textContent = units;
  document.getElementById("avg-val").textContent = formatCurrency(
    totalVal / prods.length,
  );

  let start = (currPage - 1) * itemsPerPage;
  let end = start + itemsPerPage;
  let pageProducts = products.slice(start, end);
  container.innerHTML = "";

  pageProducts.forEach((prod) => {
    const prodVal = prod.quantity * prod.price;
    const pct = units > 0 ? ((prod.quantity / units) * 100).toFixed(1) : 0;
    let html = `<tr>
      <td>${prod.name}</td>
      <td>${getCategory(prod.categoryId).name}</td>
      <td>${prod.quantity}</td>
      <td> ${formatCurrency(prod.price)}</td>
      <td class="text-success fw-bold"> ${formatCurrency(prodVal)}</td>
      <td>${pct}%</td>
    </tr>`;
    container.insertAdjacentHTML("beforeend", html);
  });
  renderPagination(prods);
};
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
    renderInventoryValue(products, invValueContent);
  }
});

document.getElementById("next-btn").addEventListener("click", () => {
  const totalPages = Math.ceil(products.length / itemsPerPage);
  if (currPage < totalPages) {
    currPage++;
    renderInventoryValue(products, invValueContent);
  }
});
const summary = () => {
  document.querySelector(".Overview-tot-prod").textContent = products.length;
  document.querySelector(".Overview-tot-inv-val").textContent =
    formatCurrency(totalVal);
  document.querySelector(".Overview-cat").textContent = categories.length;
  document.querySelector(".Overview-supp").textContent = supp.length;
  document.querySelector(".Overview-lowStock").textContent = lowStock.length;
  document.querySelector(".Overview-outStock").textContent = products.filter(
    (p) => p.quantity === 0,
  ).length;

  document.querySelector(".summary-PO").textContent = orders.length;
  document.querySelector(".summary-pending").textContent = orders.filter(
    (o) => o.status === "Pending",
  ).length;
  document.querySelector(".summary-received").textContent = orders.filter(
    (p) => p.status === "Received",
  ).length;
  document.querySelector(".summary-cancelled").textContent = orders.filter(
    (p) => p.status === "Cancelled",
  ).length;
  document.querySelector(".summary-adj").textContent = adj.length;
  document.querySelector(".summary-log").textContent = logs.length;
};
let lowbtn = document.querySelector(".content.low-stock");
let invbtn = document.querySelector(".content.inv-value");
let sumbtn = document.querySelector(".content.summary");
document.querySelector(".opt-low").addEventListener("click", () => {
  lowbtn.classList.remove("d-none");
  if (!invbtn.classList.contains("d-none")) {
    invbtn.classList.add("d-none");
  }
  if (!sumbtn.classList.contains("d-none")) {
    sumbtn.classList.add("d-none");
  }
});
document.querySelector(".opt-inv").addEventListener("click", () => {
  invbtn.classList.remove("d-none");
  if (!lowbtn.classList.contains("d-none")) {
    lowbtn.classList.add("d-none");
  }
  if (!sumbtn.classList.contains("d-none")) {
    sumbtn.classList.add("d-none");
  }
});
document.querySelector(".opt-summ").addEventListener("click", () => {
  sumbtn.classList.remove("d-none");
  if (!lowbtn.classList.contains("d-none")) {
    lowbtn.classList.add("d-none");
  }
  if (!invbtn.classList.contains("d-none")) {
    invbtn.classList.add("d-none");
  }
});
