# Navigation Contract

## Primary navigation

Use one consistent bottom navigation across Dashboard, History and Expenses. It must have exactly these five slots:

1. Dashboard
2. Historial
3. Nuevo viaje — central quick action
4. Gastos — abre Historial en modo gastos
5. Ajustes

The central action is visually prominent but remains a normal accessible control. It must not hide the action behind a gesture.

Do not introduce a second bottom-navigation variant for History. History uses the same shell and selected-state treatment as Dashboard.

## Stack behavior

- Authentication and onboarding use a stack flow.
- Dashboard, History and Settings are persistent top-level destinations.
- Gastos is a filtered History context, not a new business screen; it reuses the same list, date filters and detail behavior.
- Trip confirmation and expense entry are modal/form-sheet routes.
- Back behavior must be predictable and preserve unsaved input.

## Route intent for Fase 3

```text
app/
  (auth)/login
  (auth)/register
  (auth)/forgot-password
  (onboarding)/platforms
  (tabs)/dashboard
  (tabs)/history
  (tabs)/settings
  modals/confirm-trip
  modals/add-expense
```

The final Expo Router naming can change during implementation, but the product responsibilities must remain stable.

