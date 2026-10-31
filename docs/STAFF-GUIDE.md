# Quick staff guide

1. Open the approved university inventory address and sign in with the shared Admin
   account. Keep the password private. Settings contains language, appearance and
   Sign Out.
2. **Add Material:** open Materials → Add Material. Name and category are required;
   other information is optional. A new material starts at zero stock.
3. **Edit:** use the material's Edit action to change information. Quantity is
   changed separately through Adjust Stock.
4. **Add or remove stock:** choose Adjust Stock beside the material. Select Add Stock
   or Remove Stock, enter the quantity, check the resulting quantity and confirm
   once. English/Pashto numerals and up to three decimal places are accepted.
   Reason is optional. The server checks the actual balance before saving.
5. **Batch removal:** Materials → Remove Materials. Choose each material, add it to
   the selection, enter quantities, review once and confirm once. Every selected
   change succeeds together or none do. The same batch interface supports additions.
6. **Delete:** permanently deletes only a record the server can safely remove.
   Stock must be zero, and movement history still prevents permanent deletion.
   Do not remove stock merely to try to erase its history.
7. **Archive:** after the administrator enables migration 004, zero-stock materials
   can be archived. History stays intact. Use Archived materials to find them and
   Make Active to bring them back. Archiving does not erase or dispose of assets.
8. A category with materials cannot be deleted. View Materials shows its contents;
   edit their categories first. Archived materials also keep category relationships.
   Deleting a supplier keeps materials and clears the optional supplier reference.
9. Search at the top works throughout the application. Reports provides all-inventory
   or category printing. Unknown prices are excluded from the clearly labelled total.
10. Wait for a success message. If the connection fails, do not recreate an uncertain
    operation in another tab. Keep its tab open, close the dialog, reconnect, then
    use Retry safely. The same operation identifier prevents double deductions.

If another member changes a record while you edit it, review the conflict and load
the latest version. Do not force an old edit over new information. Refresh, switch
sections or return focus to the app to see colleagues' changes. Background refresh
also runs while the app is visible and idle.

Install the PWA from the browser's install action at the approved HTTPS address.
It still requires the university server. Offline mode never accepts inventory
changes. An update waits for your action; finish forms and pending requests first.
Sign out when finished, including in an installed app.
