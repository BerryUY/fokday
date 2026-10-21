import { suggestTarget, suggestTargets, targetMatchesGoal } from '@/domain/onboarding';

describe('onboarding suggestions', () => {
  it('suggests rounded daily targets by goal', () => {
    expect(suggestTargets(70, 'gain')).toEqual({ calories: 2500, protein: 125 });
    expect(suggestTargets(70, 'lose')).toEqual({ calories: 1800, protein: 125 });
    expect(suggestTargets(70, 'maintain')).toEqual({ calories: 2150, protein: 110 });
  });

  it('suggests a target in the goal direction', () => {
    expect(suggestTarget(70, 'gain')).toBe(75);
    expect(suggestTarget(70, 'lose')).toBe(65);
    expect(suggestTarget(70, 'maintain')).toBe(70);
    expect(suggestTarget(32, 'lose')).toBe(30);
  });

  it('checks that the target agrees with the goal', () => {
    expect(targetMatchesGoal(70, 75, 'gain')).toBe(true);
    expect(targetMatchesGoal(70, 65, 'gain')).toBe(false);
    expect(targetMatchesGoal(70, 65, 'lose')).toBe(true);
    expect(targetMatchesGoal(70, 70, 'maintain')).toBe(true);
  });
});
