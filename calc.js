/* 퇴사각 — 계산 로직 (2026년 기준)
 * 브라우저와 Node 양쪽에서 로드 가능 (테스트용)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ── 연도별 요율 테이블 — 매년 새 연도 항목만 추가하면 됨 ──────
  const RATES_BY_YEAR = {
    2026: {
      minWage: 10320,               // 최저시급
      minWageMonthly: 2156880,      // 주40시간 월 환산
      pensionRate: 0.0475,          // 국민연금 근로자 부담 (9.5%의 절반)
      pensionBaseMin: 410000,       // 기준소득월액 하한
      pensionBaseMax: 6590000,      // 기준소득월액 상한
      healthRate: 0.03595,          // 건강보험 근로자 부담 (7.19%의 절반)
      careRate: 0.1314,             // 장기요양 (건보료 대비)
      employmentRate: 0.009,        // 고용보험 근로자 부담
      ueDailyMax: 68100,            // 실업급여 1일 상한 (2026 이직자)
      ueDailyMin: 66048,            // 실업급여 1일 하한 (8시간 근로 기준)
      stdMonthlyHours: 209,         // 월 통상임금 산정 기준시간 (주40h)
    },
  };

  /** 해당 시점에 적용할 요율 — 테이블에 없는 연도는 가장 가까운 과거 연도로 대체 */
  function ratesFor(date) {
    const y = (date ? new Date(date) : new Date()).getFullYear();
    const years = Object.keys(RATES_BY_YEAR).map(Number).sort((a, b) => a - b);
    const pick = [...years].reverse().find((x) => x <= y) ?? years[0];
    return { year: pick, isStale: y > pick, ...RATES_BY_YEAR[pick] };
  }
  const RATES = ratesFor(); // 오늘 기준 요율 (하위 호환)

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const floor10 = (v) => Math.floor(v / 10) * 10;

  // ── 근로소득공제 (연간 총급여 기준) ─────────────────────────
  function earnedIncomeDeduction(gross) {
    let d;
    if (gross <= 5_000_000) d = gross * 0.7;
    else if (gross <= 15_000_000) d = 3_500_000 + (gross - 5_000_000) * 0.4;
    else if (gross <= 45_000_000) d = 7_500_000 + (gross - 15_000_000) * 0.15;
    else if (gross <= 100_000_000) d = 12_000_000 + (gross - 45_000_000) * 0.05;
    else d = 14_750_000 + (gross - 100_000_000) * 0.02;
    return Math.min(d, 20_000_000);
  }

  // ── 종합소득세 기본세율 (2023~) ─────────────────────────────
  function progressiveTax(base) {
    const brackets = [
      [14_000_000, 0.06, 0],
      [50_000_000, 0.15, 1_260_000],
      [88_000_000, 0.24, 5_760_000],
      [150_000_000, 0.35, 15_440_000],
      [300_000_000, 0.38, 19_940_000],
      [500_000_000, 0.40, 25_940_000],
      [1_000_000_000, 0.42, 35_940_000],
      [Infinity, 0.45, 65_940_000],
    ];
    if (base <= 0) return 0;
    for (const [limit, rate, deduct] of brackets) {
      if (base <= limit) return base * rate - deduct;
    }
  }

  // ── 근로소득세액공제 한도 ───────────────────────────────────
  function earnedTaxCreditCap(gross) {
    if (gross <= 33_000_000) return 740_000;
    if (gross <= 70_000_000) return Math.max(740_000 - (gross - 33_000_000) * 0.008, 660_000);
    if (gross <= 120_000_000) return Math.max(660_000 - (gross - 70_000_000) * 0.5, 500_000);
    return Math.max(500_000 - (gross - 120_000_000) * 0.5, 200_000);
  }

  /** 연봉 → 월 실수령액 (간이 계산)
   * annual: 연봉(원), taxFreeMonthly: 월 비과세(원), dependents: 본인 포함 부양가족, children: 8~20세 자녀
   */
  function netSalary({ annual, taxFreeMonthly = 200_000, dependents = 1, children = 0 }) {
    const monthlyGross = annual / 12;
    const taxBaseMonthly = Math.max(0, monthlyGross - taxFreeMonthly);

    const pension = floor10(clamp(taxBaseMonthly, RATES.pensionBaseMin, RATES.pensionBaseMax) * RATES.pensionRate);
    const health = floor10(taxBaseMonthly * RATES.healthRate);
    const care = floor10(health * RATES.careRate);
    const employment = floor10(taxBaseMonthly * RATES.employmentRate);

    // 연간 소득세 → 월 환산
    const grossYr = taxBaseMonthly * 12;
    const taxBase = Math.max(0,
      grossYr
      - earnedIncomeDeduction(grossYr)
      - 1_500_000 * Math.max(1, dependents)
      - pension * 12
    );
    const calculated = progressiveTax(taxBase);
    const earnedCredit = Math.min(
      calculated <= 1_300_000 ? calculated * 0.55 : 715_000 + (calculated - 1_300_000) * 0.30,
      earnedTaxCreditCap(grossYr)
    );
    const childCredit = children <= 0 ? 0 : children === 1 ? 250_000 : 550_000 + (children - 2) * 400_000;
    const determined = Math.max(0, calculated - earnedCredit - childCredit);

    const incomeTax = floor10(determined / 12);
    const localTax = floor10(incomeTax * 0.1);
    const totalDeduction = pension + health + care + employment + incomeTax + localTax;

    return {
      monthlyGross: Math.round(monthlyGross),
      pension, health, care, employment, incomeTax, localTax,
      totalDeduction,
      monthlyNet: Math.round(monthlyGross - totalDeduction),
    };
  }

  /** 퇴직금 (1년 미만이면 0)
   * startDate/endDate: Date, monthly3Total: 최근 3개월 임금총액(원),
   * annualBonus: 연간 상여(원), leaveAllowance: 연차수당(원)
   */
  function severance({ startDate, endDate, monthly3Total, annualBonus = 0, leaveAllowance = 0 }) {
    const MS = 86_400_000;
    const serviceDays = Math.floor((endDate - startDate) / MS) + 1;
    if (serviceDays < 365) return { serviceDays, avgDailyWage: 0, amount: 0, eligible: false };

    const from = new Date(endDate); from.setMonth(from.getMonth() - 3);
    const days3 = Math.round((endDate - from) / MS);
    const base = monthly3Total + annualBonus * (3 / 12) + leaveAllowance * (3 / 12);
    const avgDailyWage = base / days3;
    const amount = avgDailyWage * 30 * (serviceDays / 365);
    return { serviceDays, avgDailyWage: Math.round(avgDailyWage), amount: Math.round(amount), eligible: true };
  }

  /** 연차 발생일수 (근속 기준) */
  function annualLeave(joinDate, baseDate) {
    const j = new Date(joinDate), b = new Date(baseDate || Date.now());
    let years = b.getFullYear() - j.getFullYear();
    const anniv = new Date(j); anniv.setFullYear(j.getFullYear() + years);
    if (anniv > b) years -= 1;
    if (years < 0) return { years: 0, days: 0, note: '' };
    if (years < 1) {
      // 1년 미만: 1개월 개근마다 1일, 최대 11일
      let months = (b.getFullYear() - j.getFullYear()) * 12 + (b.getMonth() - j.getMonth());
      const mAnniv = new Date(j); mAnniv.setMonth(j.getMonth() + months);
      if (mAnniv > b) months -= 1;
      return { years: 0, days: Math.min(Math.max(months, 0), 11), note: '1년 미만: 개근한 달마다 1일씩 (최대 11일)' };
    }
    const days = Math.min(15 + Math.floor((years - 1) / 2), 25);
    return { years, days, note: `근속 ${years}년차: 15일 + 가산 (최대 25일)` };
  }

  /** 연차 발생일수 — 회계연도(1/1) 기준 */
  function fiscalLeave(joinDate, baseDate) {
    const j = new Date(joinDate), b = new Date(baseDate || Date.now());
    const jy = j.getFullYear(), by = b.getFullYear();
    if (by < jy) return { days: 0, note: '' };
    if (by === jy) {
      // 입사 연도: 개근한 달마다 1일 (월차 방식)
      let months = (b.getMonth() - j.getMonth());
      const mAnniv = new Date(j); mAnniv.setMonth(j.getMonth() + months);
      if (mAnniv > b) months -= 1;
      return { days: Math.min(Math.max(months, 0), 11), note: '입사 연도: 개근한 달마다 1일씩' };
    }
    if (by === jy + 1) {
      // 입사 다음 해 1/1: 전년 재직일수 비례 연차
      const daysWorked = Math.floor((new Date(jy + 1, 0, 1) - j) / 86400000);
      const prorated = Math.round(15 * (daysWorked / 365) * 10) / 10;
      return { days: prorated, note: `입사 이듬해: 15일 × 전년 재직비율 (비례연차, 1년차 월차와 별도 발생분 존재 가능)` };
    }
    const days = Math.min(15 + Math.floor((by - jy - 2) / 2), 25);
    return { days, note: `회계연도 기준 ${by - jy}년차: 매년 1/1 일괄 부여` };
  }

  /** DC형 퇴직연금 — 매년 연간 임금총액의 1/12 적립 (운용수익 제외 근사치) */
  function dcSeverance(annualTotal, years) {
    return Math.round((annualTotal / 12) * years);
  }

  /** 실업급여 (구직급여) — 비자발적 이직 가정 */
  function unemployment({ age, insuredMonths, avgMonthlyWage }) {
    let daily = (avgMonthlyWage * 3 / 91) * 0.6;
    daily = clamp(daily, RATES.ueDailyMin, RATES.ueDailyMax);
    const y = insuredMonths / 12;
    const under50 = [[1, 120], [3, 150], [5, 180], [10, 210], [Infinity, 240]];
    const over50 = [[1, 120], [3, 180], [5, 210], [10, 240], [Infinity, 270]];
    const table = age >= 50 ? over50 : under50;
    let days = 0;
    for (const [limit, d] of table) { if (y < limit) { days = d; break; } }
    return { daily: Math.round(daily), days, total: Math.round(daily * days) };
  }

  /** 야근(연장근로)수당 — 통상시급 × 시간 × 1.5 (5인 이상 사업장) */
  function overtime({ monthlySalary, hours, multiplier = 1.5 }) {
    const hourly = monthlySalary / RATES.stdMonthlyHours;
    return { hourly: Math.round(hourly), pay: Math.round(hourly * hours * multiplier) };
  }

  /** 잔여연차 수당 = 통상시급 × 8시간 × 일수 */
  function leavePayout(monthlySalary, days) {
    return Math.round((monthlySalary / RATES.stdMonthlyHours) * 8 * days);
  }

  return { RATES, ratesFor, netSalary, severance, annualLeave, fiscalLeave, dcSeverance,
           unemployment, overtime, leavePayout, earnedIncomeDeduction, progressiveTax };
});
