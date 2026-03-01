import { ref, computed } from "vue";
import { messages, type Locale } from "../i18n/messages";

const locale = ref<Locale>("en");

export function useI18n() {
  const t = computed(() => messages[locale.value]);

  function toggleLocale() {
    locale.value = locale.value === "en" ? "ko" : "en";
  }

  return {
    locale,
    t,
    toggleLocale,
  };
}
