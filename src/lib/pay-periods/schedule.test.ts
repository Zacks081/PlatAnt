import { describe, expect, it } from "vitest";

import { formatIsoDate, parseIsoDate, type CalendarDate } from "@/lib/dates";

import { colombianHolidays, easterSunday, previousBusinessDay } from "./holidays";
import {
  estimatedPayDate,
  expectedEnd,
  instanceKey,
  matchPay,
  nextInstance,
  previousInstance,
  upcomingPay,
  type PayInstance,
} from "./schedule";

const date = (iso: string): CalendarDate => parseIsoDate(iso)!;
const QUINCENAL = [15, 30];
const estimated = (instance: PayInstance, payDays = QUINCENAL) =>
  formatIsoDate(estimatedPayDate(instance, payDays));

describe("festivos de Colombia", () => {
  it("la Pascua cae donde debe", () => {
    expect(easterSunday(2026)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ year: 2027, month: 3, day: 28 });
    expect(easterSunday(2029)).toEqual({ year: 2029, month: 4, day: 1 });
  });

  it("2026 tiene los 18 festivos oficiales", () => {
    expect([...colombianHolidays(2026)].sort()).toEqual([
      "2026-01-01",
      "2026-01-12", // Reyes (6 de enero, martes → lunes)
      "2026-03-23", // San José (19 de marzo, jueves → lunes)
      "2026-04-02", // Jueves Santo
      "2026-04-03", // Viernes Santo
      "2026-05-01",
      "2026-05-18", // Ascensión
      "2026-06-08", // Corpus Christi
      "2026-06-15", // Sagrado Corazón
      "2026-06-29", // San Pedro y San Pablo (ya es lunes)
      "2026-07-20",
      "2026-08-07",
      "2026-08-17", // Asunción (15 de agosto, sábado → lunes)
      "2026-10-12",
      "2026-11-02", // Todos los Santos (1 de noviembre, domingo → lunes)
      "2026-11-16", // Independencia de Cartagena (11 de noviembre, miércoles → lunes)
      "2026-12-08",
      "2026-12-25",
    ]);
  });

  it("un día hábil se queda; un fin de semana o festivo pasa al hábil anterior", () => {
    expect(previousBusinessDay(date("2026-11-18"))).toEqual(date("2026-11-18"));
    expect(previousBusinessDay(date("2026-11-16"))).toEqual(date("2026-11-13"));
  });
});

describe("fecha estimada de cada pago", () => {
  it("si el 15 o el 30 cae en día hábil, es ese día", () => {
    expect(estimated({ year: 2026, month: 11, slot: 2 })).toBe("2026-11-30"); // lunes
    expect(estimated({ year: 2026, month: 12, slot: 1 })).toBe("2026-12-15"); // martes
  });

  it("si cae en fin de semana, el viernes anterior", () => {
    expect(estimated({ year: 2026, month: 11, slot: 1 })).toBe("2026-11-13"); // domingo 15
    expect(estimated({ year: 2026, month: 5, slot: 2 })).toBe("2026-05-29"); // sábado 30
    expect(estimated({ year: 2026, month: 8, slot: 2 })).toBe("2026-08-28"); // domingo 30
  });

  it("si cae en festivo, el día hábil anterior", () => {
    expect(estimated({ year: 2026, month: 7, slot: 2 }, [5, 20])).toBe("2026-07-17"); // 20 de julio
  });

  it("si cae en un festivo trasladado al lunes, también", () => {
    // Sagrado Corazón, lunes 15 de junio de 2026.
    expect(estimated({ year: 2026, month: 6, slot: 1 })).toBe("2026-06-12");
    // Independencia de Cartagena, del jueves 11 al lunes 15 de noviembre de 2027.
    expect(estimated({ year: 2027, month: 11, slot: 1 })).toBe("2027-11-12");
  });

  it("con dos festivos seguidos se corre hasta el primer día hábil", () => {
    // Viernes Santo el 30 de marzo de 2029 y Jueves Santo el 29.
    expect(estimated({ year: 2029, month: 3, slot: 2 })).toBe("2029-03-28");
  });

  it("febrero no tiene 30: el pago va el último día, o el hábil anterior", () => {
    expect(estimated({ year: 2027, month: 2, slot: 2 })).toBe("2027-02-26"); // domingo 28
    expect(estimated({ year: 2028, month: 2, slot: 2 })).toBe("2028-02-29"); // bisiesto, martes
  });

  it("un pago del 1 de enero se corre al año anterior", () => {
    expect(estimated({ year: 2027, month: 1, slot: 1 }, [1])).toBe("2026-12-31");
  });
});

describe("orden de los pagos", () => {
  it("quincenal: dos por mes", () => {
    const first: PayInstance = { year: 2026, month: 12, slot: 1 };
    expect(nextInstance(first, QUINCENAL)).toEqual({ year: 2026, month: 12, slot: 2 });
    expect(nextInstance({ year: 2026, month: 12, slot: 2 }, QUINCENAL)).toEqual({
      year: 2027,
      month: 1,
      slot: 1,
    });
    expect(previousInstance(first, QUINCENAL)).toEqual({ year: 2026, month: 11, slot: 2 });
    expect(instanceKey(nextInstance(first, QUINCENAL))).toBe(instanceKey(first) + 1);
  });

  it("mensual: uno por mes", () => {
    const november: PayInstance = { year: 2026, month: 11, slot: 1 };
    expect(nextInstance(november, [30])).toEqual({ year: 2026, month: 12, slot: 1 });
    expect(previousInstance(november, [30])).toEqual({ year: 2026, month: 10, slot: 1 });
  });
});

describe("a qué pago corresponde lo que llegó", () => {
  const nov15: PayInstance = { year: 2026, month: 11, slot: 1 };
  const nov30: PayInstance = { year: 2026, month: 11, slot: 2 };

  it("el día estimado", () => {
    expect(matchPay(date("2026-11-13"), null, QUINCENAL)).toEqual({
      instance: nov15,
      duplicateOf: null,
    });
  });

  it("un pago adelantado o atrasado unos días es el mismo pago", () => {
    expect(matchPay(date("2026-11-26"), nov15, QUINCENAL).instance).toEqual(nov30);
    expect(matchPay(date("2026-12-02"), nov15, QUINCENAL).instance).toEqual(nov30);
    expect(matchPay(date("2026-11-11"), null, QUINCENAL).instance).toEqual(nov15);
  });

  it("el primer pago es el que se estaba esperando, aunque llegue antes", () => {
    expect(matchPay(date("2026-11-18"), null, QUINCENAL).instance).toEqual(nov30);
  });

  it("con pagos registrados, es el que sigue al último, aunque llegue antes", () => {
    expect(matchPay(date("2026-11-18"), nov30, QUINCENAL)).toEqual({
      instance: { year: 2026, month: 12, slot: 1 },
      duplicateOf: nov30,
    });
  });

  it("si se olvidó registrar un pago, el siguiente se reconoce por su fecha", () => {
    const oct30: PayInstance = { year: 2026, month: 10, slot: 2 };
    expect(matchPay(date("2026-11-30"), oct30, QUINCENAL)).toEqual({
      instance: nov30,
      duplicateOf: null,
    });
  });

  it("si queda más cerca de un pago ya registrado, pide confirmar y propone el siguiente", () => {
    expect(matchPay(date("2026-11-14"), nov15, QUINCENAL)).toEqual({
      instance: nov30,
      duplicateOf: nov15,
    });
  });

  it("con pago mensual, un pago por mes", () => {
    const nov: PayInstance = { year: 2026, month: 11, slot: 1 };
    expect(matchPay(date("2026-11-27"), null, [30]).instance).toEqual(nov);
    expect(matchPay(date("2026-12-29"), nov, [30]).instance).toEqual({
      year: 2026,
      month: 12,
      slot: 1,
    });
    expect(matchPay(date("2026-12-02"), nov, [30]).duplicateOf).toEqual(nov);
  });
});

describe("cuándo se espera el próximo pago", () => {
  it("es la fecha estimada del pago que sigue", () => {
    const nov15: PayInstance = { year: 2026, month: 11, slot: 1 };
    expect(formatIsoDate(expectedEnd(nov15, date("2026-11-13"), QUINCENAL))).toBe("2026-11-30");
  });

  it("si el pago llegó tan tarde que el siguiente ya pasó, el que sigue", () => {
    const nov15: PayInstance = { year: 2026, month: 11, slot: 1 };
    expect(formatIsoDate(expectedEnd(nov15, date("2026-12-01"), QUINCENAL))).toBe("2026-12-15");
  });

  it("sin quincena todavía: el próximo pago desde hoy", () => {
    expect(formatIsoDate(upcomingPay(date("2026-11-18"), QUINCENAL))).toBe("2026-11-30");
    expect(formatIsoDate(upcomingPay(date("2026-11-13"), QUINCENAL))).toBe("2026-11-13");
    expect(formatIsoDate(upcomingPay(date("2026-11-14"), QUINCENAL))).toBe("2026-11-30");
  });
});
