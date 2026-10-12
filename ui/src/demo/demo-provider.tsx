import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { signal, type Signal } from '@preact/signals-react';
import { useSignals } from '@preact/signals-react/runtime';
import { BehaviorSubject } from 'rxjs';
import { createDemoState } from './model';
import type { DemoState } from './contracts';

type DemoRuntime = {
  snapshot: Signal<DemoState>;
  update: (transform: (state: DemoState) => DemoState) => void;
  reset: () => void;
};
const DemoContext = createContext<DemoRuntime | undefined>(undefined);
export function DemoProvider({ children }: PropsWithChildren) {
  const [subject] = useState(() => new BehaviorSubject(createDemoState()));
  const [snapshot] = useState(() => signal(subject.value));
  useEffect(() => {
    const subscription = subject.subscribe((state) => {
      snapshot.value = state;
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [subject, snapshot]);
  const runtime: DemoRuntime = {
    snapshot,
    update: (transform) => {
      subject.next(transform(subject.value));
    },
    reset: () => {
      subject.next(createDemoState());
    },
  };
  return <DemoContext.Provider value={runtime}>{children}</DemoContext.Provider>;
}
export function useDemo() {
  useSignals();
  const runtime = useContext(DemoContext);
  if (!runtime) {
    throw new Error('DemoProvider requerido.');
  }
  return { state: runtime.snapshot.value, update: runtime.update, reset: runtime.reset };
}
