// Service worker mínimo: existe apenas para satisfazer o critério de
// instalação de PWA no Android/Chrome (Add to Home Screen). Não faz cache —
// cada requisição vai direto pra rede, então nunca serve conteúdo velho.
self.addEventListener("fetch", () => {});
