import type { Activity, DemoState, ExpenseDraft, Platform, Scenario, ValidExpense, Validation } from './contracts';
export function createDemoState(): DemoState { throw new Error('Demo state not implemented'); }
export function enterDemo(_state: DemoState): DemoState { throw new Error('Demo entry not implemented'); }
export function selectPlatforms(_state: DemoState, _platforms: readonly Platform[]): DemoState { throw new Error('Platform selection not implemented'); }
export function openWorkspace(_state: DemoState): DemoState { throw new Error('Workspace entry not implemented'); }
export function changeScenario(_state: DemoState, _scenario: Scenario): DemoState { throw new Error('Scenario not implemented'); }
export function updateDraft(_state: DemoState, _draft: ExpenseDraft): DemoState { throw new Error('Draft not implemented'); }
export function discardDraft(_state: DemoState): DemoState { throw new Error('Discard not implemented'); }
export function addExpense(_state: DemoState, _expense: ValidExpense): DemoState { throw new Error('Expense not implemented'); }
export function confirmTrip(_state: DemoState, _trip: Activity): DemoState { throw new Error('Trip not implemented'); }
export function validateExpense(_draft: ExpenseDraft): Validation<ValidExpense> { throw new Error('Validation not implemented'); }
export function validateIdentity(_identity: string, _password?: string): Validation<string> { throw new Error('Identity validation not implemented'); }
