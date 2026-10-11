if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("PWAのオフラインキャッシュを登録できませんでした。", error);
    });
  });
}
