import { Redirect } from 'expo-router';
import { SESSION } from '../../src/demo/contracts';
import { entryRoute } from '../../src/demo/navigation';
import { useDemo } from '../../src/demo/demo-provider';
import { TripModal } from '../../src/screens/trip-modal';
export default function ConfirmTrip() {
  const { state } = useDemo();
  if (state.session !== SESSION.WORKSPACE) {
    return <Redirect href={entryRoute(state.session)} />;
  }
  return <TripModal />;
}
