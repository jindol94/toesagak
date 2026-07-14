/* 퇴사각 계산 로직 검증 테스트 */
const C = require('./calc.js');
let pass = 0, fail = 0;

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${detail}`); }
}
function near(v, target, tol) { return Math.abs(v - target) <= tol; }

console.log('\n[1] 실수령액 (netSalary)');
{
  // 연봉 3,000만 / 비과세 20만 / 1인 — 시중 계산기 대략 월 224~228만
  const r = C.netSalary({ annual: 30_000_000 });
  ok('연봉 3000만 실수령 224만~229만', near(r.monthlyNet, 2_265_000, 40_000), `→ ${r.monthlyNet.toLocaleString()}`);

  // 연봉 5,000만 — 대략 355~365만
  const r2 = C.netSalary({ annual: 50_000_000 });
  ok('연봉 5000만 실수령 352만~366만', near(r2.monthlyNet, 3_590_000, 70_000), `→ ${r2.monthlyNet.toLocaleString()}`);

  // 연봉 1억 — 대략 650~665만
  const r3 = C.netSalary({ annual: 100_000_000 });
  ok('연봉 1억 실수령 640만~670만', near(r3.monthlyNet, 6_550_000, 150_000), `→ ${r3.monthlyNet.toLocaleString()}`);

  // 공제 합계 일관성
  ok('공제 합계 = 항목 합', r2.totalDeduction ===
    r2.pension + r2.health + r2.care + r2.employment + r2.incomeTax + r2.localTax);

  // 국민연금 상한 (기준소득월액 659만 → 월 313,025원)
  const r4 = C.netSalary({ annual: 200_000_000 });
  ok('국민연금 상한 적용 (313,020원)', r4.pension === 313_020, `→ ${r4.pension.toLocaleString()}`);

  // 부양가족 많으면 세금 감소
  const r5 = C.netSalary({ annual: 50_000_000, dependents: 4, children: 2 });
  ok('부양가족↑ → 실수령↑', r5.monthlyNet > r2.monthlyNet);
}

console.log('\n[2] 퇴직금 (severance)');
{
  // 딱 1년, 월 300만 → 약 300만 (30일치 평균임금)
  const r = C.severance({
    startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'),
    monthly3Total: 9_000_000,
  });
  ok('1년 근속 월300 → 퇴직금 ≈295~300만', r.eligible && near(r.amount, 2_967_000, 50_000), `→ ${r.amount.toLocaleString()}`);

  // 1년 미만 → 0원
  const r2 = C.severance({
    startDate: new Date('2026-01-01'), endDate: new Date('2026-06-30'),
    monthly3Total: 9_000_000,
  });
  ok('1년 미만 → 퇴직금 없음', !r2.eligible && r2.amount === 0);

  // 3년 근속이면 1년의 약 3배
  const r3 = C.severance({
    startDate: new Date('2023-01-01'), endDate: new Date('2025-12-31'),
    monthly3Total: 9_000_000,
  });
  ok('3년 근속 ≈ 1년의 3배', near(r3.amount, r.amount * 3, 60_000), `→ ${r3.amount.toLocaleString()}`);
}

console.log('\n[3] 연차 (annualLeave)');
{
  ok('입사 6개월차 → 6일', C.annualLeave('2026-01-10', '2026-07-14').days === 6);
  ok('1년차 → 15일', C.annualLeave('2025-01-01', '2026-07-14').days === 15);
  ok('3년차 → 16일', C.annualLeave('2023-01-01', '2026-07-14').days === 16);
  ok('5년차 → 17일', C.annualLeave('2021-01-01', '2026-07-14').days === 17);
  ok('21년차 이상 → 최대 25일', C.annualLeave('2000-01-01', '2026-07-14').days === 25);
  ok('입사 전 날짜 → 0일', C.annualLeave('2027-01-01', '2026-07-14').days === 0);
}

console.log('\n[4] 실업급여 (unemployment)');
{
  // 월 400만, 40세, 5년 가입 → 일액 상한 68,100 × 210일
  const r = C.unemployment({ age: 40, insuredMonths: 60, avgMonthlyWage: 4_000_000 });
  ok('고임금 → 상한 68,100원', r.daily === 68_100, `→ ${r.daily}`);
  ok('40세 · 5년 → 210일', r.days === 210);
  ok('총액 = 일액×일수', r.total === 68_100 * 210);

  // 최저임금 수준 → 하한 66,048
  const r2 = C.unemployment({ age: 30, insuredMonths: 18, avgMonthlyWage: 2_156_880 });
  ok('저임금 → 하한 66,048원', r2.daily === 66_048, `→ ${r2.daily}`);
  ok('30세 · 1.5년 → 150일', r2.days === 150);

  // 50세 이상 · 10년 → 270일
  const r3 = C.unemployment({ age: 55, insuredMonths: 130, avgMonthlyWage: 3_000_000 });
  ok('55세 · 10년+ → 270일', r3.days === 270);
}

console.log('\n[5] 야근수당 · 연차수당');
{
  // 월 209만 → 통상시급 1만 → 10시간 야근 = 15만
  const r = C.overtime({ monthlySalary: 2_090_000, hours: 10 });
  ok('통상시급 1만원', r.hourly === 10_000);
  ok('야근 10시간 → 15만원', r.pay === 150_000);

  // 연차수당: 시급 1만 × 8h × 5일 = 40만
  ok('잔여연차 5일 → 40만원', C.leavePayout(2_090_000, 5) === 400_000);
}

console.log('\n[6] 회계연도 연차 · DC형 퇴직금');
{
  // 입사 연도: 월차 방식
  ok('회계연도: 입사 4개월차 → 4일', C.fiscalLeave('2026-03-02', '2026-07-14').days === 4);
  // 입사 다음 해: 비례연차 (2025-07-01 입사 → 184일 재직 → 15×184/365 ≈ 7.6일)
  const p = C.fiscalLeave('2025-07-01', '2026-07-14');
  ok('회계연도: 이듬해 비례연차 ≈7.6일', near(p.days, 7.6, 0.2), `→ ${p.days}`);
  // 3년차 이후
  ok('회계연도: 입사+2년 → 15일', C.fiscalLeave('2024-06-01', '2026-07-14').days === 15);
  ok('회계연도: 입사+4년 → 16일', C.fiscalLeave('2022-06-01', '2026-07-14').days === 16);
  // DC형: 연 4,800만 × 3년 = 1,200만
  ok('DC형: 연4800만×3년 → 1,200만', C.dcSeverance(48_000_000, 3) === 12_000_000);
}

console.log('\n[7] 연도별 요율 선택 (ratesFor)');
{
  ok('2026년 → 2026 요율', C.ratesFor('2026-07-14').year === 2026 && !C.ratesFor('2026-07-14').isStale);
  ok('2027년(미등록) → 2026 요율 + stale 표시', C.ratesFor('2027-03-01').year === 2026 && C.ratesFor('2027-03-01').isStale);
  ok('2025년(과거) → 가장 오래된 요율로 대체', C.ratesFor('2025-01-01').year === 2026);
  ok('RATES = 오늘 기준', C.RATES.year === 2026 && C.RATES.minWage === 10320);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
