# Motion Contract

Design-only motion rules for the first UI implementation.

## Principles

- Motion explains cause and effect; it is not decoration.
- Prefer transform, opacity and native spring behavior.
- Micro-interactions target 150–300ms; exits are shorter than entries.
- Respect reduced-motion preferences.
- Never block input during animation.

## Approved moments

- Dashboard progress hero reveals current progress on load or refresh.
- KPI values crossfade when the selected date changes.
- Pressed controls use a restrained scale/opacity response.
- Modal/form sheets enter from the initiating action's spatial context.
- Forward navigation moves into the next task; back navigation reverses it.
- Lists may use a short stagger only when it improves scanning.

## Not approved

- Continuous decorative motion while the driver is operating.
- Long celebratory animations that delay confirmation.
- Animating layout dimensions and causing content reflow.
- Motion as the only indication of a state change.

