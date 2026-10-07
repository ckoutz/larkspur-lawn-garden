// The GVAS demo backend this site talks to. With `sandbox` on, every visitor
// gets their own copy of Larkspur (js/sandbox.js); `businessKey` is the shared
// demo business, used only where the backend has sandboxes off.
window.LARKSPUR = {
  apiUrl: "https://web-demo-5831.up.railway.app",
  businessKey: "gvb_ANFmibma_UEm3Z_HJg44Ow",
  sandbox: true,
  dashboardOrigin: "https://larkspur-dashboard.vercel.app",
  // Güd Vector's booking page. Empty hides "Book a call with Güd Vector".
  bookCallUrl: "",
};
