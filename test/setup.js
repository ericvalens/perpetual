globalThis.__UI_SDK_STRICT__ = true

Element.prototype.getAnimations = () => []
Element.prototype.checkVisibility = () => true
globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })

// jsdom's ElementInternals lacks the form and state parts ui-sdk's elements use.
const attachInternals = HTMLElement.prototype.attachInternals
HTMLElement.prototype.attachInternals = function () {
  const internals = attachInternals?.call(this) ?? {}
  internals.setFormValue ??= () => {}
  internals.setValidity ??= () => {}
  internals.checkValidity ??= () => true
  internals.reportValidity ??= () => true
  if (!internals.states) Object.defineProperty(internals, "states", { value: new Set() })
  return internals
}
