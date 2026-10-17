import DB from "./db.js";
import utils from "./utils.js";
import { injectPageContent } from "./navbar.js";

const tableBody = document.querySelector("#tableBody");
const moduleSelect = document.querySelector("#moduleSelect");
let currPage = 1;
let filteredLogs = [];
const itemsPerPage = 5;

function renderTableBody() {
  const selectedModule = moduleSelect.value;
  const allLogs = DB.getLog();
  tableBody.innerHTML = ``;

  // * Checking the selected module and filtering based on the action included:
  filteredLogs =
    selectedModule === "all"
      ? allLogs
      : allLogs.filter((log) => log.action.includes(selectedModule));

  currPage = 1;
  renderPage();
}

function renderPage() {
  tableBody.innerHTML = "";

  if (filteredLogs.length === 0) {
    tableBody.innerHTML = `<tr><td class="text-center text-muted py-5" colspan="5">
      <i class="bi-inbox display-4 d-block mb-3"></i>No activity logs found
    </td></tr>`;
    renderPagination();
    return;
  }

  // * Logs should be rendered in reverse order as the latest is always the top most:
  const reversed = [...filteredLogs].reverse();
  const start = (currPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageLogs = reversed.slice(start, end);

  pageLogs.forEach((log) => {
    const row = document.createElement("tr");
    let badgeClass = "";
    const actionType = log.action.split("_")[1];
    if (["ADDED", "CREATED", "RECEIVED"].includes(actionType)) badgeClass = "bg-success";
    else if (["CANCELLED", "DELETED"].includes(actionType)) badgeClass = "bg-danger";
    else if (actionType === "UPDATED") badgeClass = "bg-info";
    else if (actionType === "ADJUSTED") badgeClass = "bg-secondary";
    else badgeClass = "bg-dark";

    row.innerHTML = `
      <td>${utils.formatDate(log.createdAt)}</td>
      <td><span class="text-muted">${log.action.split("_")[0]}</span></td>
      <td><span class='badge ${badgeClass}'>${actionType}</span></td>
      <td>${log.message}</td>
      <td><i class='bi bi-person-circle me-1'></i>Admin</td>
    `;
    tableBody.appendChild(row);
  });

  renderPagination();
}


moduleSelect.addEventListener("change", renderTableBody);

//pagination Logic
const renderPagination = () => {
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const start = (currPage - 1) * itemsPerPage + 1;
  const end = Math.min(currPage * itemsPerPage, filteredLogs.length); // ← was products.length

  document.getElementById("pagination-results").textContent =
    `Showing ${start}-${end} of ${filteredLogs.length} results`;

  document.getElementById("previous-btn").disabled = currPage === 1;
  document.getElementById("next-btn").disabled = currPage === totalPages;
};

document.getElementById("previous-btn").addEventListener("click", () => {
  if (currPage > 1) {
    currPage--;
    renderPage(); // ← was renderTableBody(filteredLogs)
  }
});

document.getElementById("next-btn").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  if (currPage < totalPages) {
    currPage++;
    renderPage(); // ← was renderProducts(filteredLogs)
  }
});



//-------------------------------------------------------------------
// Initializing the page:
function init() {
  if (DB.getLog().length === 0) {
  }
  renderTableBody();
}
init();
// Inject the page content into the navbar wrapper
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
});
