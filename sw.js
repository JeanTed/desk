/* Service worker minimal du Desk : il rend le site installable comme application (Chrome, Edge).
   Il ne garde rien en mémoire : toutes les données restent en direct. */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function(){ /* laisse passer toutes les requêtes telles quelles */ });
