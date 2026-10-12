import { useState } from 'react';
import { router } from 'expo-router';
import { CATEGORY, ROUTE, SCENARIO } from '../demo/contracts';
import { useDemo } from '../demo/demo-provider';
import { addExpense, discardDraft, updateDraft, validateExpense } from '../demo/model';
import { DemoScreen } from '../components/demo-screen';
import { Action, Card, Copy, Field, Message } from '../components/ui';
export function ExpenseModal() {
  const { state, update } = useDemo();
  const [feedback, setFeedback] = useState('');
  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTE.DASHBOARD);
  }
  return (
    <DemoScreen
      scenarios={[
        SCENARIO.READY,
        SCENARIO.INVALID,
        SCENARIO.LOADING,
        SCENARIO.SUCCESS,
        SCENARIO.OFFLINE,
        SCENARIO.PENDING,
      ]}
    >
      <Copy large>Nuevo gasto de prueba</Copy>
      <Card>
        <Field
          label="Importe COP sin separadores de miles"
          value={state.draft.amount}
          keyboardType="decimal-pad"
          onChangeText={(amount) => {
            update((current) => updateDraft(current, { ...current.draft, amount }));
          }}
        />
        <Copy>Categoría: {state.draft.category}</Copy>
        {CATEGORY.map((category) => (
          <Action
            key={category}
            secondary
            title={category}
            onPress={() => {
              update((current) => updateDraft(current, { ...current.draft, category }));
            }}
          />
        ))}
        <Field
          label="Fecha AAAA-MM-DD"
          value={state.draft.date}
          onChangeText={(date) => {
            update((current) => updateDraft(current, { ...current.draft, date }));
          }}
        />
        <Field
          label="Nota opcional"
          value={state.draft.note}
          multiline
          onChangeText={(note) => {
            update((current) => updateDraft(current, { ...current.draft, note }));
          }}
        />
        {feedback !== '' && <Message>{feedback}</Message>}
        <Action
          title="Añadir a la demostración"
          disabled={state.scenario === SCENARIO.LOADING}
          onPress={() => {
            const checked = validateExpense(state.draft);
            if (!checked.ok) {
              setFeedback(checked.message);
              return;
            }
            update((current) => addExpense(current, checked.value));
            setFeedback(
              state.scenario === SCENARIO.OFFLINE || state.scenario === SCENARIO.PENDING
                ? 'Gasto de ejemplo añadido; pendiente simulado. No se escribió en una cola real.'
                : 'Gasto añadido a la demostración, solo en memoria.',
            );
          }}
        />
      </Card>
      <Action secondary title="Cerrar y conservar borrador" onPress={close} />
      <Action
        secondary
        title="Descartar borrador explícitamente"
        onPress={() => {
          update(discardDraft);
          close();
        }}
      />
    </DemoScreen>
  );
}
