import { Redirect } from 'expo-router';
import { SESSION } from '../../src/demo/contracts';
import { entryRoute } from '../../src/demo/navigation';
import { useDemo } from '../../src/demo/demo-provider';
import { ExpenseModal } from '../../src/screens/expense-modal';
export default function AddExpense() {
  const { state } = useDemo();
  if (state.session !== SESSION.WORKSPACE) {
    return <Redirect href={entryRoute(state.session)} />;
  }
  return <ExpenseModal />;
}
