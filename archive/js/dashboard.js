import { injectPageContent } from "./navbar.js";
import db from "./db.js";
import utils from "./utils.js";

const existingSuppliers = db.getSuppliers();
if (existingSuppliers.length === 0) {
  db.seed();
}

let productsNumber = document.querySelector(".products-number");
let lowStockNumber = document.querySelector(".low-stock-number");
let outOfStockNumber = document.querySelector(".out-of-stock-number");
let inventoryValueNumber = document.querySelector(".inventory-value-number");

let stockAdjustmentsNumber = document.querySelector(
  ".stock-adjustments-number",
);
let purchaseOrdersNumber = document.querySelector(".purchase-orders-number");
let suppliersNumber = document.querySelector(".suppliers-number");
let categoriesNumber = document.querySelector(".categories-number");

function getLowStockNumber() {
  let products = db.getProducts();
  let count = 0;

  products.forEach((product) => {
    if (product.quantity <= product.reorderLevel) count++;
  });

  return count;
}

function getOutOfStockNumber() {
  let products = db.getProducts();
  let count = 0;

  products.forEach((product) => {
    if (product.quantity === 0) count++;
  });

  return count;
}

function getInventoryValue() {
  let products = db.getProducts();
  let value = 0;

  products.forEach((product) => {
    value += product.price * product.quantity;
  });

  return utils.formatCurrency(value);
}

productsNumber.textContent = db.getProducts().length;
lowStockNumber.textContent = getLowStockNumber();
outOfStockNumber.textContent = getOutOfStockNumber();
inventoryValueNumber.textContent = getInventoryValue();

stockAdjustmentsNumber.textContent = db.getAdjustments().length;
purchaseOrdersNumber.textContent = db.getOrders().length;
suppliersNumber.textContent = db.getSuppliers().length;
categoriesNumber.textContent = db.getCategories().length;

document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
});
