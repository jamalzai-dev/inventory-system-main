import DB from "./db.js";
//& Actions object that contains all actions
const ACTIONS = {
  PRODUCT_ADDED: "PRODUCT_ADDED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  PRODUCT_DELETED: "PRODUCT_DELETED",
  SUPPLIER_ADDED: "SUPPLIER_ADDED",
  SUPPLIER_UPDATED: "SUPPLIER_UPDATED",
  SUPPLIER_DELETED: "SUPPLIER_DELETED",
  CATEGORY_ADDED: "CATEGORY_ADDED",
  CATEGORY_DELETED: "CATEGORY_DELETED",
  CATEGORY_UPDATED: "CATEGORY_UPDATED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_RECEIVED: "ORDER_RECEIVED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  STOCK_ADJUSTED: "STOCK_ADJUSTED",
};

//* generating unique id
const generateUniqueId = (prefix) => {
  const uniqueTimestamp = Date.now();
  const randomValue = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${uniqueTimestamp}_${randomValue}`;
};

//^ generating id that increments based on the last item in the array: - we would decide which one we should use -
const generateNextId = (dataArray, prefix) => {
  if (dataArray.length === 0) return `${prefix}_001`;
  const lastItem = dataArray[dataArray.length - 1];
  const lastNumberAsStr = lastItem.id.split("_")[1];
  const lastNumberLen = lastNumberAsStr.length;
  const lastNumber = parseInt(lastNumberAsStr);
  const nextIdNumber = (lastNumber + 1).toString().padStart(lastNumberLen, "0");
  return `${prefix}_${nextIdNumber}`;
};

//~ Fomating date to be readable:
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    const altDate = new Date(dateString.replace(/-/g, "/"));
    if (isNaN(altDate.getTime())) return "Invalid Date";
    return altDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

//* Formating currency to be displayed in EGP:
// const formatCurrency = (amount) => {
//     return Intl.NumberFormat("en-EG", {
//         style: "currency",
//         currency: "EGP",
//         currencyDisplay: "code"
//     }).format(amount);
// }
//* For better performance we define a formatter first to not be generated through iterations
const egpFormatter = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
  currencyDisplay: "code",
});

const formatCurrency = (amount) => egpFormatter.format(amount);

//^ show toast message alert function
const showToast = (message, type = "success") => {
  const toastId = `toast-${Date.now()}`;
  const bgColor = type === "error" ? "text-bg-danger" : "text-bg-success";
  const toastHTML = `
            <div id="${toastId}" class="toast ${bgColor}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header">
                    <strong class="me-auto">Notification</strong>
                    <small>just now</small>
                    <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    <strong>${type.toUpperCase()}</strong> ${message}
                </div>
            </div>
        `;

  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container position-fixed bottom-0 end-0 p-3";
    document.body.appendChild(container);
  }

  container.insertAdjacentHTML("beforeend", toastHTML);

  const toastElement = document.getElementById(toastId);
  const bsToast = new bootstrap.Toast(toastElement, { delay: 3000 });
  bsToast.show();
  //clearing the dom after deletion
  toastElement.addEventListener("hidden.bs.toast", () => {
    toastElement.remove();
  });
};

//^ confirm delete function called on any delete btn for confirmation:
const confirmDelete = (name) =>
  confirm(`Are you sure you want to delete "${name}"? This cannot be undone!`);

//^ logAction function:
const logAction = (action, message) => {
  const timeStamp = Date.now();
  const newLog = {
    id: generateNextId(DB.getLog(), "log"),
    action: action,
    message: message,
    createdAt: new Date(timeStamp).toISOString(),
  };

  DB.addLog(newLog);
};

export default {
  ACTIONS,
  generateUniqueId,
  generateNextId,
  formatDate,
  formatCurrency,
  showToast,
  confirmDelete,
  logAction,
};
