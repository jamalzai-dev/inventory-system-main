import DB from "./db.js";
import utils from "./utils.js";
import { injectPageContent } from "./navbar.js";

const supplierSelect = document.querySelector("#supplierSelect");
const productSelect = document.querySelector("#productSelect");
const addProdBtn = document.querySelector("#addProdBtn");
const createOrderBtn = document.querySelector("#createBtn");
const poForm = document.querySelector("#poForm");
const productQuantityElm = document.querySelector("#productQuantity");

// TESTING:
// ! Condition to make sure that data isn't being overridden by the seeding each page refresh, but rather check if there is data already or not:
const existingOrders = DB.getOrders();
if (existingOrders.length === 0) {
  DB.seed();
}

// ? Rendering supplier & product options:
function renderSupplierOptions() {
  // * Checking deletion status of the suppliers:
  let suppliers = DB.getSuppliers();
  suppliers = suppliers.filter((supplier) => supplier.deleted === false);
  supplierSelect.innerHTML = "";

  if (suppliers && suppliers.length > 0) {
    supplierSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="">Select supplier</option>`,
    );
    suppliers.forEach((supplier) => {
      const optionHtml = `<option value='${supplier.id}'>${supplier.name}</option>`;
      supplierSelect.insertAdjacentHTML("beforeend", optionHtml);
    });
  } else {
    supplierSelect.innerHTML = `<option value="">No suppliers available</option>`;
  }
}
function renderProductOptions(supplierId = "") {
  const products = DB.getProducts();
  const unitPriceElm = document.querySelector("#unitPrice");
  productSelect.innerHTML = "";

  if (!supplierId) {
    productSelect.innerHTML = `<option value="">Please select supplier first</option>`;
    unitPriceElm.textContent = "EGP 0.00";
    return;
  }
  // * Getting only the supplier's products for rendering:
  const supplierProducts = products.filter(
    (product) => product.supplierId === supplierId,
  );

  if (supplierProducts.length > 0) {
    supplierProducts.forEach((product) => {
      const optionHtml = `<option value='${product.id}'>${product.name}</option>`;
      productSelect.insertAdjacentHTML("beforeend", optionHtml);
    });
    //* Getting first element's price since this is the first one rendered:
    unitPriceElm.textContent = `EGP ${supplierProducts[0].price}`;
  } else {
    productSelect.innerHTML = `<option value="">No products available for this supplier</option>`;
    unitPriceElm.textContent = "EGP 0.00";
  }
}

function onSupplierChange(event) {
  renderProductOptions(event.target.value);
}
// ? Making sure date input is right:
function setMinDate() {
  const today = new Date();
  const formattedDate = today.toISOString().split("T")[0];
  const minDateInput = document.querySelector("#minDateField");
  const maxDateInput = document.querySelector("#maxDateField");
  minDateInput.setAttribute("min", formattedDate);
  minDateInput.setAttribute("value", formattedDate);
  maxDateInput.setAttribute("min", formattedDate);
}

function fetchUnitPrice(event) {
  const unitPriceElm = document.querySelector("#unitPrice");
  const products = DB.getProducts();
  let product = products.find((product) => product.id === event.target.value);

  if (product) {
    unitPriceElm.textContent = utils.formatCurrency(product.price);
  } else {
    unitPriceElm.textContent = utils.formatCurrency(0);
  }
}

//? Product's price fetching:
productSelect.addEventListener("change", fetchUnitPrice);

//? Create chosen products table in the modal:
function renderChosenProducts() {
  const tableWrapper = document.querySelector("#tableWrapper");
  const tableBody = document.querySelector("#modalTableBody");
  const unitPriceElm = document.querySelector("#unitPrice");

  // ! Gets the selected product index to then get the value of the shown 'text':
  const selectedProdIndex = productSelect.selectedIndex;
  const selectedProdValue = productSelect.options[selectedProdIndex].text;
  const totalAmountElm = document.querySelector("#totalAmountRow");
  const totalPricesElm = document.querySelector("#totalPrices");

  const rawPrice =
    parseFloat(unitPriceElm.textContent.replace(/[^0-9.]/g, "")) || 0;
  const qty = parseInt(productQuantityElm.value) || 1;
  if (!qty || qty < 1) {
    utils.showToast("Quantity must be at least 1", "error");
    return;
  }
  const rowTotal = rawPrice * qty;

  //* Check if there are no suppliers chosen:
  if (selectedProdValue !== "Please select supplier first") {
    //Show table and then create rows when the button is clicked:

    tableWrapper.classList.remove("hidden");
    const row = document.createElement("tr");
    // * This class is later used to check for the amount of rows to remove the whole table body if there was only one row existing and it got removed:
    row.classList.add("rows");
    row.dataset.id = productSelect.value;

    const cellName = document.createElement("td");
    cellName.textContent = `${selectedProdValue}`;

    const cellQuantity = document.createElement("td");
    cellQuantity.textContent = `${productQuantityElm.value}`;

    const cellPrice = document.createElement("td");
    cellPrice.textContent = utils.formatCurrency(rawPrice);

    const cellTotal = document.createElement("td");

    // const totalValue =
    //   cellPrice.textContent.split("$")[1] * cellQuantity.textContent;
    cellTotal.textContent = utils.formatCurrency(rowTotal);
    cellTotal.classList.add("totalValues");

    const removeBtn = document.createElement("td");
    removeBtn.innerHTML = `<button type="button" class="btn btn-danger btn-sm"><i class="bi bi-trash"></i></button>`;
    //* Removing the whole table if there is only one row getting deleted, and removing one row if there are more:
    removeBtn.addEventListener("click", function () {
      row.remove();
      const remainingRows = document.querySelectorAll(".rows");
      if (remainingRows.length === 0) {
        tableWrapper.classList.add("hidden");
      }
      // * Updating total:
      calculateGrandTotal();
    });

    row.appendChild(cellName);
    row.appendChild(cellQuantity);
    row.appendChild(cellPrice);
    row.appendChild(cellTotal);
    row.appendChild(removeBtn);

    tableBody.insertBefore(row, totalAmountElm);
    // * Calculating Grand total price:
    const calculateGrandTotal = () => {
      const totalValues = document.querySelectorAll(".totalValues");

      const totalSum = [...totalValues].reduce((acc, elm) => {
        const val = parseFloat(elm.textContent.replace(/[^0-9.]/g, "")) || 0;
        return acc + val;
      }, 0);
      totalPricesElm.innerHTML = `<strong>${utils.formatCurrency(totalSum)}</strong>`;
    };
    calculateGrandTotal();
  }
}
addProdBtn.addEventListener("click", renderChosenProducts);
productQuantityElm.addEventListener("input", () => {
  if (productQuantityElm.value < 1) productQuantityElm.value = 1;
});

// ? Creating PO:
poForm.addEventListener("submit", (e) => {
  e.preventDefault();

  //* Gathering Items from the table rows
  const itemRows = document.querySelectorAll(".rows");
  if (itemRows.length === 0) {
    utils.showToast("Please add at least one product", "error");
    return;
  }

  const items = Array.from(itemRows).map((row) => ({
    productId: row.dataset.id,
    quantity: parseInt(row.cells[1].textContent),
    // * Converting the string to a float that can be used for multiplication:
    unitPrice: parseFloat(row.cells[2].textContent.replace(/[^0-9.]/g, "")),
  }));

  //* Creating the Order Object
  const totalValue = parseFloat(
    document.querySelector("#totalPrices").textContent.replace(/[^0-9.]/g, ""),
  );

  const newOrder = {
    id: utils.generateNextId(DB.getOrders(), "po"),
    poNumber: `PO-${Date.now().toString().slice(-4)}`,
    supplierId: supplierSelect.value,
    status: "Pending",
    items: items,
    totalValue: totalValue,
    createdAt: new Date().toISOString(),
    expectedDate: document.querySelector("#maxDateField").value,
    receivedAt: null,
  };

  // * Saving to DB and Log
  DB.addOrder(newOrder);
  utils.logAction(
    utils.ACTIONS.ORDER_CREATED,
    `Created order ${newOrder.poNumber}`,
  );

  // * Closing the Modal
  const modalEl = document.querySelector("#createOrderModal");
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  modalInstance.hide();

  // * Refreshing the Main Table and Reseting the Form
  renderMainOrdersTable();
  poForm.reset();
  document.querySelectorAll(".rows").forEach((el) => el.remove());
  document.querySelector("#tableWrapper").classList.add("hidden");
  utils.showToast("Order created successfully!", "success");
});

// ? Rendering the Main Table:
function renderMainOrdersTable() {
  const mainTbody = document.querySelector("#tableBody");
  const orders = DB.getOrders();
  const suppliers = DB.getSuppliers();

  if (orders.length === 0) return;

  mainTbody.innerHTML = "";

  orders.forEach((order) => {
    const supplier = suppliers.find((s) => s.id === order.supplierId);
    // * Adding bg-color for classes based on status of the PO:
    let badgeClass = "bg-warning";
    if (order.status === "Received") {
      badgeClass = "bg-success";
    }
    if (order.status === "Cancelled") {
      badgeClass = "bg-danger";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <tr>
        <td>${order.poNumber}</td>
        <td>${supplier ? supplier.name : "Unknown"}</td>
        <td>${utils.formatDate(order.createdAt)}</td>
        <td>${order.expectedDate ? utils.formatDate(order.expectedDate) : "Not Set"}</td>
        <td>${utils.formatCurrency(order.totalValue)}</td>
       <td><span class="badge ${badgeClass}">${order.status}</span></td>
        <td class="action-cell">
          ${
            order.status === "Pending"
              ? `<button class="btn  me-3 btn-sm btn-success receive-btn" data-id="${order.id}"><i class="bi bi-check-lg"></i> Receive</button>
                 <button class="btn btn-sm btn-danger cancel-btn" data-id="${order.id}"><i class="bi bi-x-lg"></i> Cancel</button>`
              : ""
          }
        </td>
      </tr>
    `;
    const receiveBtn = row.querySelector(".receive-btn");
    const cancelBtn = row.querySelector(".cancel-btn");

    if (receiveBtn) {
      receiveBtn.addEventListener("click", () =>
        handleStatusChange(order.id, "Received"),
      );
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () =>
        handleStatusChange(order.id, "Cancelled"),
      );
    }
    mainTbody.appendChild(row);
  });
}

// * To avoid multiple eventlisteners for one button:
function caller() {
  renderSupplierOptions();
  renderProductOptions();
  setMinDate();
}

// * Handling changes in the status in terms of DB and log updating:
function handleStatusChange(orderId, newStatus) {
  const actionMessage = newStatus === "Received" ? "received" : "cancelled";

  // Updating products if a product is received:
  if (newStatus === "Received") {
    const orders = DB.getOrders();
    const order = orders.find((o) => o.id === orderId);

    if (order && order.items) {
      order.items.forEach((item) => {
        const products = DB.getProducts();
        const product = products.find((p) => p.id === item.productId);

        if (product) {
          const currentQty = parseInt(product.quantity) || 0;
          const addedQty = parseInt(item.quantity) || 0;
          const newQty = currentQty + addedQty;

          DB.updateProduct(product.id, { quantity: newQty });

          utils.logAction(
            utils.ACTIONS.STOCK_ADJUSTED,
            `Stock increased: ${product.name} (+${addedQty}) via ${order.poNumber}`,
          );
        }
      });
    }
  }
  // Updating the order
  DB.updateOrder(orderId, {
    status: newStatus,
    receivedAt: newStatus === "Received" ? new Date().toISOString() : null,
  });
  // Logging the new action:
  const logStatus =
    newStatus === "Received"
      ? utils.ACTIONS.ORDER_RECEIVED
      : utils.ACTIONS.ORDER_CANCELLED;
  utils.logAction(logStatus, `Order ${orderId} ${actionMessage}`);
  // Refreshing table:
  renderMainOrdersTable();
  utils.showToast(`Order ${newStatus.toLowerCase()} successfully!`, "success");
}

supplierSelect.addEventListener("change", onSupplierChange);
if (createOrderBtn) {
  createOrderBtn.addEventListener("click", caller);
}

//-------------------------------------------------------------------
// Initializing the page:
function init() {
  caller();
  renderMainOrdersTable();
}
init();
// Inject the page content into the navbar wrapper
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
});
