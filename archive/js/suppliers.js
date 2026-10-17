import db from "./db.js";
import utils from "./utils.js";
import { injectPageContent } from "./navbar.js";

let addSupplierbtn = document.querySelector(".add-supplier-btn");
let dialog = document.querySelector("dialog");
let submitNewSupplier = document.querySelector(".submit-new-supplier");
let closeDialogButton = document.querySelector(".btn-dialog-close");
let cancelbtn = document.querySelector(".cancel-btn");
let suppliersTable = document.querySelector("tbody");

// ! Condition to make sure that data isn't being overridden by the seeding each page refresh, but rather check if there is data already or not:
const existingSuppliers = db
  .getSuppliers()
  .filter((supplier) => !supplier.deleted);
if (existingSuppliers.length === 0) {
  db.seed();
}

function renderSuppliers(suppliers) {
  //let suppliers = db.getSuppliers();
  suppliers = suppliers.filter((supplier) => supplier.deleted === false);
  suppliersTable.innerHTML = "";
  if (suppliers && suppliers.length > 0) {
    suppliers.forEach((supplier) => {
      const html = `
            <tr>
                <td class="fw-bold" >
                <i class="fa-solid fa-boxes-packing mx-1" style="color: #ec5b13;"></i>
                ${supplier.name}
                </td>
                <td>${supplier.contact}</td>
                <td>${supplier.email}</td>
                <td>${supplier.phone}</td>
                <td>${supplier.address}</td>
                <td>
                      <button class="btn btn-sm edit-btn" data-id="${supplier.id}" title="Edit">
                            <i class="fa-regular fa-pen-to-square"></i>
                      </button>
                      <button class="btn btn-sm delete-btn" data-id="${supplier.id}" title="Delete">
                            <i class="fa-regular fa-trash-can"></i>
                      </button>
                </td>
            </tr>
        `;

      suppliersTable.insertAdjacentHTML("beforeend", html);
    });
  } else {
    suppliersTable.innerHTML = `
    <tr>
        <td colspan="6" class="text-center text-muted py-4">
            No suppliers found.
        </td>
    </tr>
`;
  }
}

window.addEventListener("load", () => {
  renderSuppliers(db.getSuppliers());
});

function validateSupplierForm(name, contact, email, phone, address, id = null) {
  const errors = [];

  const suppliers = db.getSuppliers().filter((supplier) => !supplier.deleted);
  const isDuplicateEmail = suppliers.some(
    (supplier) => supplier.email === email.trim() && supplier.id !== id,
  );
  const isDuplicatePhone = suppliers.some(
    (supplier) => supplier.phone === phone.trim() && supplier.id !== id,
  );

  if (!name.trim()) {
    errors.push("Supplier name is required.");
  } else if (!/^[a-zA-Z\s]+$/.test(name)) {
    errors.push("Supplier name must only contain letters and spaces.");
  }

  if (!contact.trim()) {
    errors.push("Contact person is required.");
  } else if (!/^[a-zA-Z\s]+$/.test(contact)) {
    errors.push("Contact name must only contain letters and spaces.");
  }

  if (!email.trim()) {
    errors.push("Email is required.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Email address is not valid.");
  } else if (isDuplicateEmail) {
    errors.push("A supplier with this email already exists");
  }

  if (!phone.trim()) {
    errors.push("Phone number is required.");
  } else if (!/^\d{11}$/.test(phone.replace(/\s/g, ""))) {
    errors.push(
      "Phone number must be exactly 11 digits and contain no letters.",
    );
  } else if (isDuplicatePhone) {
    errors.push("A supplier with this phone number already exists");
  }

  if (!address.trim()) {
    errors.push("Address is required.");
  } else if (!/^[a-zA-Z0-9\s,.\-#]+$/.test(address)) {
    errors.push("Address contains invalid characters.");
  }

  return errors;
}

submitNewSupplier.addEventListener("click", () => {
  const name = document.querySelector("#supplier-name").value;
  const contact = document.querySelector("#contact-person").value;
  const email = document.querySelector("#supplier-email").value;
  const phone = document.querySelector("#supplier-phone").value;
  const address = document.querySelector("#supplier-address").value;

  let errors;

  if (dialog.dataset.mode === "edit") {
    errors = validateSupplierForm(
      name,
      contact,
      email,
      phone,
      address,
      dialog.dataset.editId,
    );
    if (errors.length > 0) {
      console.log(errors);
      utils.showToast(errors[0], "error");
      return;
    }
    db.updateSupplier(dialog.dataset.editId, {
      name,
      contact,
      email,
      phone,
      address,
    });
    utils.showToast("Supplier was updated successfully");
    utils.logAction(
      utils.ACTIONS.SUPPLIER_UPDATED,
      `Updated supplier: ${name}`,
    ); // if name was updated, do i put new or old name?
  } else {
    errors = validateSupplierForm(name, contact, email, phone, address);
    if (errors.length > 0) {
      console.log(errors);
      utils.showToast(errors[0], "error");
      return;
    }
    db.addSupplier({
      id: utils.generateNextId(db.getSuppliers(), "sup"),
      name,
      contact,
      email,
      phone,
      address,
      createdAt: new Date().toISOString(),
      deleted: false,
    });
    utils.showToast("Supplier was added successfully");
    utils.logAction(utils.ACTIONS.SUPPLIER_ADDED, `Added supplier: ${name}`);
  }

  refreshTable();
  closeDialog();
});

addSupplierbtn.addEventListener("click", () => {
  openDialog("add");
});

/// edit supplier
suppliersTable.addEventListener("click", (e) => {
  let editbtn = e.target.closest(".edit-btn");
  let deletebtn = e.target.closest(".delete-btn");

  if (editbtn) {
    let supplier = getSupplierById(editbtn.dataset.id);
    openDialog("edit", supplier);
  }

  if (deletebtn) {
    let supplier = getSupplierById(deletebtn.dataset.id);
    let purchaseOrders = db.getOrders();
    let supplierWithPendingOrder = purchaseOrders.find(
      (order) => order.status === "Pending" && order.supplierId === supplier.id,
    );
    if (supplierWithPendingOrder) {
      utils.showToast(
        "This supplier can't be deleted becasuse it has a pending order",
        "error",
      );
    } else if (utils.confirmDelete(supplier.name)) {
      db.updateSupplier(deletebtn.dataset.id, { deleted: true });
      refreshTable();
      utils.showToast("Supplier was deleted successfully");
      utils.logAction(
        utils.ACTIONS.SUPPLIER_DELETED,
        `Deleted supplier: ${supplier.name}`,
      );
    }
  }
});

function openDialog(mode, supplier = null) {
  const title = dialog.querySelector("h5");
  const submitBtn = dialog.querySelector(".submit-new-supplier");

  if (mode === "edit") {
    title.textContent = "Edit Supplier";
    submitBtn.textContent = "Save Changes";
    const name = document.querySelector("#supplier-name");
    const contact = document.querySelector("#contact-person");
    const email = document.querySelector("#supplier-email");
    const phone = document.querySelector("#supplier-phone");
    const address = document.querySelector("#supplier-address");

    name.value = supplier.name;
    contact.value = supplier.contact;
    email.value = supplier.email;
    phone.value = supplier.phone;
    address.value = supplier.address;

    dialog.dataset.mode = "edit";
    dialog.dataset.editId = supplier.id;
  } else {
    document.querySelector("dialog form").reset();
    title.textContent = "Add New Supplier";
    submitBtn.textContent = "Add Supplier";
    dialog.dataset.mode = "add";
  }
  dialog.showModal();
}

let searchBox = document.querySelector(".search");
searchBox.addEventListener("input", () => {
  search(searchBox.value.trim());
});

function search(value) {
  let suppliers = db.getSuppliers();
  let filterdSuppliers = [];

  suppliers.forEach((supplier) => {
    for (let key of Object.keys(supplier)) {
      if (
        key !== "id" &&
        key !== "createdAt" &&
        key !== "deleted" &&
        supplier[key].toLowerCase().includes(value.toLowerCase())
      ) {
        filterdSuppliers.push(supplier);
        break;
      }
    }
  });

  renderSuppliers(filterdSuppliers);
}

function refreshTable() {
  const searchValue = document.querySelector(".search").value;
  if (searchValue.trim()) {
    search(searchValue);
  } else {
    renderSuppliers(db.getSuppliers());
  }
}

cancelbtn.addEventListener("click", () => {
  closeDialog();
});

closeDialogButton.addEventListener("click", () => {
  dialog.close();
});

// close and reset dialog || helper
function closeDialog() {
  dialog.close();
  document.querySelector("dialog form").reset();
}

// Inject the page content into the navbar wrapper
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
});

// get supplier by id || helper
function getSupplierById(id) {
  let suppliers = db.getSuppliers();
  let supplier = suppliers.find((supplier) => supplier.id === id);

  if (!supplier) {
    throw new Error("Supplier not found");
  }

  return supplier;
}
