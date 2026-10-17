import DB from "./db.js";
import utils from "./utils.js";
const {  
    ACTIONS,
    generateNextId,  
    showToast, 
    confirmDelete, 
    logAction } = utils;
import { injectPageContent } from "./navbar.js";

const existingCategories = DB.getCategories();
if (!existingCategories) DB.seed();

//^ Dom Selectors:
const AddCategoryBtn = document.querySelector(".add-category-btn");
const dialog = document.querySelector("dialog");
const submitNewCategory = document.querySelector(".submit-new-category");
const closeDialogBtn = document.querySelector("#dialog-close");
const cancelBtn = document.querySelector(".cancel-btn");
const categoriesTable = document.querySelector("tbody");
const categoryNameInput = document.querySelector("#category-name");
const descriptionInput = document.querySelector("#description");

//* RenderCategories Function:
const renderCategories = () => {
  const categories = DB.getCategories();
  categoriesTable.innerHTML = "";
  if (!categories || categories.length === 0) {
    categoriesTable.innerHTML = `
            <tr>
                <td colspan="3" class="text-center text-muted py-4">
                    <i class="fa-regular fa-folder-open me-2"></i> No Categories found
                </td>
            </tr>
        `;
    return;
  }

  categories.forEach((category) => {
    const tableHTML = `
                <tr id="${category.id}">
                    <td class="fw-bold">
                        <i class="fa-regular fa-bookmark" style="color: #ec5b13;"></i>
                        ${category.name}
                    </td>
                    <td>
                        ${category.description}
                    </td>
                    <td>
                        <button class="btn btn-sm edit-btn" data-id="${category.id}" title="Edit">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-sm delete-btn" data-id="${category.id}" title="Delete">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
    categoriesTable.insertAdjacentHTML("beforeend", tableHTML);
  });
};

//^ Validation:
const validateCategoryForm = (name, description) => {
  const errors = [];
  if (!name.trim()) {
    errors.push("Category name is required!");
  } else if (!/^[a-zA-z\s]+$/.test(name)) {
    errors.push("Categry name must only contain letters and spaces!");
  }

  if (!description.trim()) {
    errors.push("Category description is required!");
  } else if (description.trim().length < 10) {
    errors.push("Description must be at least 10 characters!");
  }

  return errors;
};

//^ Submit and validating duplicates as well
submitNewCategory.addEventListener("click", () => {
  const name = categoryNameInput.value;
  const description = descriptionInput.value;
  const errors = validateCategoryForm(name, description);

  if (errors.length > 0) {
    showToast(errors[0], "error");
    return;
  }

  //^ checking duplicate inputs:
  const duplicate = DB.getCategories().find(
    (cat) =>
      cat.name.toLowerCase() === name.trim().toLowerCase() &&
      cat.id !== dialog.dataset.editId,
  );

  if (duplicate) {
    showToast("A category with this name already exists!", "error");
    return;
  }

  if (dialog.dataset.mode === "edit") {
    DB.updateCategory(dialog.dataset.editId, { name, description });
    logAction(ACTIONS.CATEGORY_UPDATED, `Updated Category: ${name}`);
    showToast("Category updated successfully.");
  } else {
    DB.addCategory({
      id: generateNextId(DB.getCategories(), "cat"),
      name,
      description,
      createdAt: new Date().toISOString(),
    });
    logAction(ACTIONS.CATEGORY_ADDED, `Added Category: ${name}`);
    showToast("Category added successfully.");
  }

  renderCategories();
  closeDialog();
});

//^ openDialog function:
function openDialog(mode, category = null) {
  const title = document.querySelector("h5");
  const form = document.querySelector("form");

  form.reset();

  if (mode === "edit" && category) {
    title.textContent = "Edit Category";
    submitNewCategory.textContent = "Save Changes";
    categoryNameInput.value = category.name;
    descriptionInput.value = category.description;
    dialog.dataset.mode = "edit";
    dialog.dataset.editId = category.id;
  } else {
    title.textContent = "Add New Category";
    submitNewCategory.textContent = "Add Category";
    dialog.dataset.mode = "add";
    delete dialog.dataset.editId;
  }

  dialog.showModal();
}

//^ CloseDialog Function:
function closeDialog() {
  dialog.close();
  dialog.querySelector("form").reset();
}

//* EventListeners:
AddCategoryBtn.addEventListener("click", () => {
  openDialog("add");
});

cancelBtn.addEventListener("click", () => {
  closeDialog();
});

closeDialogBtn.addEventListener("click", () => {
  dialog.close();
});

//^ Table category Delegation
categoriesTable.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".edit-btn");
  const deleteBtn = e.target.closest(".delete-btn");

  if (editBtn) {
    const category = getCategoryById(editBtn.dataset.id);
    if (category) openDialog("edit", category);
  }

  if (deleteBtn) {
    const category = getCategoryById(deleteBtn.dataset.id);
    if (category && confirmDelete(category.name)) {
      DB.deleteCategory(deleteBtn.dataset.id);
      logAction(ACTIONS.CATEGORY_DELETED, `Deleted category: ${category.name}`);
      showToast("Category deleted successfully!");
      renderCategories();
    }
  }
});

//^ getCategoryById function
function getCategoryById(id) {
  const categories = DB.getCategories();
  const category = categories.find((category) => category.id === id) || null;

  return category;
}

window.addEventListener("load", renderCategories);

//~ injecting the page content into injected wrapper
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
});
// console.log(DB.seed());
