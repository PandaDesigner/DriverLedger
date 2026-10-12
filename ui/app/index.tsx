import { Redirect } from 'expo-router';
import { useDemo } from '../src/demo/demo-provider';
import { entryRoute } from '../src/demo/navigation';
export default function Index() {
  const { state } = useDemo();
  return <Redirect href={entryRoute(state.session)} />;
}
