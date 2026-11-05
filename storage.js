(function (root) {
  "use strict";
  const KEY = "catalogdraft.state.v1";
  function load(store) {
    let raw;
    try {
      raw = store.getItem(KEY);
    } catch (e) {
      return {
        state: root.CatalogLogic.emptyState(),
        mode: "memory",
        message:
          "Хранилище браузера недоступно. Скачайте резерв перед закрытием.",
        raw: null,
      };
    }
    if (raw === null)
      return {
        state: root.CatalogLogic.emptyState(),
        mode: "persistent",
        raw: null,
      };
    try {
      return {
        state: root.CatalogLogic.validateState(JSON.parse(raw)),
        mode: "persistent",
        raw: null,
      };
    } catch (e) {
      return {
        state: root.CatalogLogic.emptyState(),
        mode: "corrupt",
        message:
          "Сохранённые данные повреждены. Они не заменены. Скачайте исходное сохранение или восстановите резерв.",
        raw,
      };
    }
  }
  function save(store, state) {
    try {
      store.setItem(
        KEY,
        JSON.stringify(root.CatalogLogic.validateState(state)),
      );
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message:
          "Изменения остаются только в памяти. Скачайте резерв перед закрытием страницы.",
      };
    }
  }
  root.CatalogStorage = { KEY, load, save };
})(globalThis);
