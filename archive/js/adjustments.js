//* Import modules
import DB from "./db.js";
import utils from "./utils.js";
import { injectPageContent } from "./navbar.js";

//* Variables declaration:
const {
    ACTIONS, 
    generateUniqueId, 
    generateNextId, 
    formatDate, 
    formatCurrency, 
    showToast, 
    confirmDelete, 
    logAction
} = utils;


//^ DOM Selectors:
const adjustmentsTable = document.querySelector("#adjustments-table");
const addAdjustmentBtn = document.querySelector(".add-adjustment-btn");
const dialog = document.querySelector("dialog");
const closeDialogBtn = document.querySelector("#dialog-close");
const productSelect = document.querySelector("#product-select");
const stockHint = document.querySelector("#stock-hint");
const increaseBtn = document.querySelector("#type-increase");
const decreaseBtn = document.querySelector("#type-decrease");
const quantityInput = document.querySelector("#quantity");
const reasonInput = document.querySelector("#reason");
const submitAdjustment = document.querySelector("#submit-adjustment");
const cancelBtn = document.querySelector("#cancel-btn");

const products = DB.getProducts();
const existingAdjustments = DB.getAdjustments();
if(!existingAdjustments) DB.seed();
let selectedType = "increase";


//^ RenderAdjustments Function: 
const renderAdjustments = () => {
    const adjustments = DB.getAdjustments();
    adjustmentsTable.innerHTML = "";
    if(!adjustments || adjustments.length === 0) {
        adjustmentsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    <i class="fa-regular fa-folder-open me-2"></i>No Stock Adjustments Found
                </td>
            </tr>
        `;
        return;
    }

    adjustments.forEach((adjustment) => {
        const tableHTML = `
            <tr id="${adjustment.id}">
                <td class="fw-bold">
                    <i class="fa-solid fa-sliders" style="color: #ec5b13;"></i>
                    ${formatDate(adjustment.createdAt)}
                </td>
                <td>
                    ${getProductNameById(adjustment.productId, products)}
                </td>
                <td>
                    ${adjustment.type}
                </td>
                <td>
                    ${adjustment.quantity}
                </td>
                <td>
                    ${adjustment.reason}
                </td>
            </tr>
        `;
        adjustmentsTable.insertAdjacentHTML("beforeend", tableHTML);
    });
}


//* EventListeners: 
//^ AddAdjustment
addAdjustmentBtn.addEventListener("click", () => {
    PopulateProducts();
    dialog.showModal();    
});

//^ selectProduct
productSelect.addEventListener("change", updateStockHint);

//& decreaseBtn
decreaseBtn.addEventListener("click", () => toggleType("decrease"));

//^ increaseBtn
increaseBtn.addEventListener("click", () => toggleType("increase"))


//^ SubmitBtn
submitAdjustment.addEventListener("click", () => {
    const productId = productSelect.value;
    const type = selectedType;
    const quantity = quantityInput.value;
    const reason = reasonInput.value;

    const errors = validateAdjustmentForm(productId, type, quantity, reason);

    if(errors.length > 0) {
        showToast(errors[0], "error");
        return;
    }

    //~ Capturing form data:
    const product = getProductById(productId);
    const qty = Number(quantity);
    const newQty = type === "increase" ? product.quantity + qty : product.quantity - qty;

    //^ 1- Save Adjustments
    DB.addAdjustment({
        id: generateNextId(DB.getAdjustments(), "adj"),
        productId,
        type,
        quantity: qty,
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
    });
    //^ 2- Update Product Quantity
    DB.updateProduct(productId, { quantity: newQty });
    //^ 3- Log Action
    logAction(
        ACTIONS.STOCK_ADJUSTED,
        `Stock Adjusted: ${product.name} (SKU: ${product.sku}) - ${type} ${qty} - ${reason.trim()}`
    );
    //^ 4- Show feedback in showToast()
    showToast(
        `Stock ${type === "increase" ? "increased" : "decreased"} successfully. New Quantity: ${newQty}`
    );
    //^ 5- Reset and re-render
    resetForm();
    PopulateProducts();
    renderAdjustments();
    closeDialog();
});

//! CloseBtn
closeDialogBtn.addEventListener("click", () => {
    console.log("ALooooooooooooooo");
    dialog.close();
});
//! Cancel btn
cancelBtn.addEventListener("click", () => {
    resetForm();
    closeDialog();
});




//* Helper Functions:
//^ GetAdjustmentById function: // do we need action for edit and delete? I don't think so!
// function getAdjustmentById(id) {
//     const adjustments = DB.getAdjustments();
//     const adjustment = adjustments.find((adjust) => adjust.id === id) || null;
//     return adjustment;
// }

//^ GetingUniqueProductsNames function: 
// function getUniqueProductsNames(products) {
//     return [...new Set(products.map(product => product.name))];
// }

//^ GetingProductNameById function:
function getProductNameById(productId, products) {
    const product = DB.getProducts().find(product => product.id === productId);
    return product ? product.name : "Unknown Product";
}

//^ GetProductById function: 
function getProductById(id){
    const product = DB.getProducts().find((product) => product.id === id) || null;
    return product;
}

//^ PopulateProducts Function:
function PopulateProducts(){
    const products = DB.getProducts();
    productSelect.innerHTML = `
        <option value="" disabled selected>Select a product...</option>
    `;
    
    if(!products || products.length === 0) {
        productSelect.innerHTML += `
            <option value="" disabled selected>No products found...</option>
        `;
        return;
    }

    // products.forEach(product => {
    //     productSelect.innerHTML = `
    //         <option value="${product.id}" data-qty="${product.quantity}">${product.name} (SKU: ${product.sku})</option>
    //     `;
    // });
    productSelect.innerHTML = `
    <option value="" selected disabled>Select a product...</option>
    ${products.map(product => {
        return  `<option value="${product.id}" data-qty="${product.quantity}">${product.name} (SKU: ${product.sku})</option>`
    }).join("")}`;
}

//^ UpdateStockHint Function:
function updateStockHint() {
    const selected = productSelect.options[productSelect.selectedIndex];
    const qty = Number(selected.dataset.qty); //~ important to cast it to Number!
    if(!productSelect.value) {
        stockHint.textContent = "";
        stockHint.className = "stock-hint";
        return;
    }

    if(qty === 0){
        stockHint.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i> Current Stock: 0 -- Can't subtract from this product!
        `;
        stockHint.className = "stock-hint danger";

        //~ Auto-select the decrease toggleBtn
        toggleType("decrease");
        decreaseBtn.disabled = true;

    } else if(qty <= getProductById(productSelect.value)?.reorderLevel) {
        stockHint.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i> Current stock: ${qty} -> below reorderLevel!
        `;
        stockHint.className = "stock-hint warning";
        decreaseBtn.disabled = false;
    } else {
        stockHint.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i> Current Stock: ${qty} units.
        `;
        stockHint.className = "stock-hint success";
        decreaseBtn.disabled = false;
    }
}

//* VALIDATION: checks -> product & type & Quantity & reason
function validateAdjustmentForm(productId, type, quantity, reason) {
    const errors = [];
    const product = getProductById(productId);
    
    //& product
    if(!productId) {
        errors.push("Please Select a Product!");
        // return errors;
    }

    //& type
    if(!type || !["increase", "decrease"].includes(type)) {
        errors.push("Please Select an Adjustment Type!");
    }

    //& Quantity
    if(!quantity && quantity !== 0) { // 0 or not exist
        errors.push("Quantity is Required!");
    } else if(isNaN(quantity)) { // not a number
        errors.push("Quantity must be a Number!");
    } else if (!Number.isInteger(Number(quantity))) { // Whole Number
        errors.push("Quantity must be a whole number! --No Decimals--");
    } else if(Number(quantity) <= 0) { // Positive
        errors.push("Quantity must be greater than zero!");
    } else if(type === "decrease" && product && Number(quantity) > product.quantity) { // Subtracting a bigger number than current
        errors.push(`Cannot decrease ${quantity} -- Current Stock is only ${product.quantity} units`);
    } else if(type === "decrease" && product && product.quantity === 0) {
        errors.push("Current Stock is 0! What do you want to subtract!");
    }

    if(!reason.trim()) {
        errors.push("Reason is required");
    } else if(reason.trim().length < 5 || reason.trim().length > 120){ // min and max reason length
        errors.push("Reason must be at least 5 charcters and don't exceed 120 characters");
    }
    return errors;
}



//^ Setting the toggle type function: ==> toggleType?
function toggleType(type) {
    selectedType = type;
    if(type === "increase"){
        console.log("Clicked");
        increaseBtn.classList.add("active");
        decreaseBtn.classList.remove("active");
    } else {            
        increaseBtn.classList.remove("active");
        decreaseBtn.classList.add("active");
    }
}

//! There is both and I think we need the reset more than closeDialog
//^ resetForm function:
function resetForm() {
    productSelect.value = "";
    quantityInput.value = "";
    reasonInput.value = "";
    stockHint.textContent = "";
    stockHint.className = "stock-hint";
    decreaseBtn.disabled = false;
    toggleType("increase");
}

//^ CloseDialog Function:
function closeDialog() {
  dialog.close();
  dialog.querySelector("form").reset();
}

window.addEventListener("load", renderAdjustments);

//~ injecting the page content into injected wrapper
document.addEventListener("DOMContentLoaded", () => {
  const contentContainer = document.querySelector("#injected");
  if (contentContainer) {
    injectPageContent(contentContainer);
  }
});