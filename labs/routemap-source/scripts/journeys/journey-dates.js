"use strict";

// Date parsing, stop ranges, route sequence numbering, and naming tokens.

function ordinalDayNumberWords(value) {
  const ones = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
  const teens = ["tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
  const tens = ["", "", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];
  const tensBase = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number < 10) return ones[number];
  if (number < 20) return teens[number - 10];
  if (number < 100) {
    const ten = Math.floor(number / 10);
    const one = number % 10;
    return one ? `${tensBase[ten]}-${ones[one]}` : tens[ten];
  }
  return String(number);
}

function sequenceNumberFromInput(value) {
  const text = String(value || "").trim();
  if (!text || /^auto$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function sequenceNumberInputValue(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? String(Math.floor(Number(value))) : "Auto";
}

function parseTripDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function sequenceNumberForTripDay(trip, dayIndex) {
  const days = trip?.days || [];
  for (let index = Math.min(dayIndex, days.length - 1); index >= 0; index -= 1) {
    const sequenceNumber = Number(days[index]?.sequenceNumber);
    if (Number.isFinite(sequenceNumber) && sequenceNumber > 0) {
      return Math.floor(sequenceNumber) + (dayIndex - index);
    }
  }
  return dayIndex + 1;
}

function dateForTripDay(trip, dayIndex) {
  const days = trip?.days || [];
  const directRouteDate = parseTripDate(days[dayIndex]?.sequenceDate);
  if (directRouteDate) return directRouteDate;
  const destinationStop = trip?.stops?.[dayIndex + 1];
  const originStop = trip?.stops?.[dayIndex];
  const stopDate = parseTripDate(
    destinationStop?.arrivalDate || destinationStop?.departureDate || originStop?.departureDate || ""
  );
  if (stopDate) return stopDate;
  for (let index = Math.min(dayIndex, days.length - 1); index >= 0; index -= 1) {
    const anchor = parseTripDate(days[index]?.sequenceDate);
    if (anchor) {
      anchor.setDate(anchor.getDate() + (dayIndex - index));
      return anchor;
    }
  }
  return null;
}

function ordinalNumericDate(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  const lastTwo = number % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? "th"
    : number % 10 === 1 ? "st" : number % 10 === 2 ? "nd" : number % 10 === 3 ? "rd" : "th";
  return `${number}${suffix}`;
}

function cardinalDayNumberWords(value) {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number < 20) return ones[number];
  if (number < 100) {
    const ten = Math.floor(number / 10);
    const one = number % 10;
    return one ? `${tens[ten]}-${ones[one]}` : tens[ten];
  }
  return String(number);
}

function dayNameContext(trip, dayIndex) {
  const route = trip?.days?.[dayIndex];
  const destinationStop = trip?.stops?.[dayIndex + 1];
  const nextStop = trip?.stops?.[dayIndex + 2];
  const fallbackDate = dateForTripDay(trip, dayIndex);
  return {
    trip: String(trip?.name || "journey"),
    from: route ? routeEndpointName(route, "start") : "starting stop",
    to: route ? routeEndpointName(route, "end") : destinationStop?.name || "destination",
    stop: String(destinationStop?.name || (route ? routeEndpointName(route, "end") : "destination")),
    stopNumber: dayIndex + 2,
    nextStop: String(nextStop?.name || ""),
    startDate: parseTripDate(destinationStop?.arrivalDate) || fallbackDate,
    endDate: parseTripDate(destinationStop?.departureDate) || parseTripDate(destinationStop?.arrivalDate) || fallbackDate
  };
}

function longTemplateDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${MONTH_FULL[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function shortTemplateDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function templateDateRange(start, end, short = false) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return "";
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return short ? shortTemplateDate(start) : longTemplateDate(start);
  const monthNames = short ? MONTH_ABBR : MONTH_FULL;
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${monthNames[start.getMonth()]} ${start.getDate()}\u2013${end.getDate()}, ${end.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${monthNames[start.getMonth()]} ${start.getDate()}\u2013${monthNames[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${short ? shortTemplateDate(start) : longTemplateDate(start)}\u2013${short ? shortTemplateDate(end) : longTemplateDate(end)}`;
}

function formatDayPattern(pattern, dayNumber, date, context = {}) {
  const validDate = date instanceof Date && !Number.isNaN(date.getTime());
  const day = validDate ? date.getDate() : 0;
  const month = validDate ? date.getMonth() : 0;
  const year = validDate ? date.getFullYear() : 0;
  const startDate = context.startDate instanceof Date ? context.startDate : validDate ? date : null;
  const endDate = context.endDate instanceof Date ? context.endDate : startDate;
  const explicitReplacements = {
    "{day}": cardinalDayNumberWords(dayNumber),
    "{day#}": String(dayNumber),
    "{dayOrdinal}": ordinalDayNumberWords(dayNumber),
    "{dayOrdinal#}": ordinalNumericDate(dayNumber),
    "{startDate}": longTemplateDate(startDate),
    "{endDate}": longTemplateDate(endDate),
    "{dateRange}": templateDateRange(startDate, endDate),
    "{startDateShort}": shortTemplateDate(startDate),
    "{endDateShort}": shortTemplateDate(endDate),
    "{dateRangeShort}": templateDateRange(startDate, endDate, true),
    "{startDateISO}": startDate ? dateToIso(startDate) : "",
    "{endDateISO}": endDate ? dateToIso(endDate) : "",
    "{dateRangeISO}": startDate && endDate ? `${dateToIso(startDate)}\u2013${dateToIso(endDate)}` : startDate ? dateToIso(startDate) : "",
    "{startDay}": startDate ? ordinalDayNumberWords(startDate.getDate()) : "",
    "{startDay#}": startDate ? String(startDate.getDate()) : "",
    "{endDay}": endDate ? ordinalDayNumberWords(endDate.getDate()) : "",
    "{endDay#}": endDate ? String(endDate.getDate()) : "",
    "{startMonth}": startDate ? MONTH_FULL[startDate.getMonth()] : "",
    "{endMonth}": endDate ? MONTH_FULL[endDate.getMonth()] : "",
    "{startMonthShort}": startDate ? MONTH_ABBR[startDate.getMonth()] : "",
    "{endMonthShort}": endDate ? MONTH_ABBR[endDate.getMonth()] : "",
    "{startMonth#}": startDate ? String(startDate.getMonth() + 1) : "",
    "{endMonth#}": endDate ? String(endDate.getMonth() + 1) : "",
    "{startYear#}": startDate ? String(startDate.getFullYear()) : "",
    "{endYear#}": endDate ? String(endDate.getFullYear()) : "",
    "{startWeekday}": startDate ? startDate.toLocaleDateString(undefined, { weekday: "long" }) : "",
    "{endWeekday}": endDate ? endDate.toLocaleDateString(undefined, { weekday: "long" }) : "",
    "{trip}": context.trip || "",
    "{startStop}": context.from || "",
    "{endStop}": context.to || "",
    "{stop}": context.stop || context.to || "",
    "{stop#}": String(context.stopNumber || dayNumber + 1),
    "{nextStop}": context.nextStop || ""
  };
  const legacyReplacements = {
    "%date": validDate ? `${month + 1}/${day}/${year}` : "",
    "%iso": validDate ? dateToIso(date) : "",
    "%trip": context.trip || "",
    "%from": context.from || "",
    "%stop": context.stop || context.to || "",
    "%to": context.to || "",
    "%mm#": validDate ? ordinalDayNumberWords(day) : "",
    "%m#": validDate ? String(day) : "",
    "%ww": validDate ? date.toLocaleDateString(undefined, { weekday: "long" }) : "",
    "%w": validDate ? date.toLocaleDateString(undefined, { weekday: "short" }) : "",
    "%yy": validDate ? String(year) : "",
    "%y": validDate ? String(year).slice(-2).padStart(2, "0") : "",
    "%nn": validDate ? String(month + 1).padStart(2, "0") : "",
    "%n": validDate ? String(month + 1) : "",
    "%mm": validDate ? MONTH_FULL[month] : "",
    "%m": validDate ? MONTH_ABBR[month] : "",
    "%dd": ordinalDayNumberWords(dayNumber),
    "%d": String(dayNumber),
    "%o": validDate ? ordinalNumericDate(day) : ""
  };
  let result = String(pattern || DEFAULT_DAY_NAME_PATTERN);
  Object.entries({ ...explicitReplacements, ...legacyReplacements })
    .sort(([first], [second]) => second.length - first.length)
    .forEach(([token, value]) => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "gi"), value);
    });
  return result.replace(/\s+/g, " ").trim() || `day ${dayNumber}`;
}

function formatDaySequenceName(trip, dayIndex) {
  return formatDayPattern(
    trip?.dayNamePattern || DEFAULT_DAY_NAME_PATTERN,
    sequenceNumberForTripDay(trip, dayIndex),
    dateForTripDay(trip, dayIndex),
    dayNameContext(trip, dayIndex)
  );
}



function resequenceTripDayLabels(trip = activeTrip()) {
  if (!trip) return;
  trip.days.forEach((route, index) => {
    if (!route.autoLabel) return;
    const nextLabel = formatDaySequenceName(trip, index);
    route.label = nextLabel;
    route.title = nextLabel;
  });
}

function enableAutoLabelsFrom(trip = activeTrip(), startIndex = state.activeRouteIndex) {
  if (!trip) return;
  trip.days.forEach((route, index) => {
    if (index >= startIndex) route.autoLabel = true;
  });
}



function displayDateValue(iso = "") {
  if (!isoDateValue(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

function dateToIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseFlexibleDate(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? dateToIso(date) : null;
  }
  const numeric = text.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))$/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? dateToIso(date) : null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : dateToIso(parsed);
}

function nearestStopDate(stopIndex = selectedStopIndex) {
  const trip = activeTrip();
  const stops = synchronizeTripStops(trip);
  const current = stops[stopIndex];
  if (current?.arrivalDate || current?.departureDate) return current.arrivalDate || current.departureDate;
  for (let distance = 1; distance < stops.length; distance += 1) {
    const previous = stops[stopIndex - distance];
    if (previous?.departureDate || previous?.arrivalDate) return previous.departureDate || previous.arrivalDate;
    const next = stops[stopIndex + distance];
    if (next?.arrivalDate || next?.departureDate) return next.arrivalDate || next.departureDate;
  }
  return isoDateValue(trip?.tripStartDate) || dateToIso(new Date());
}

function updateLegDatesAroundStop(trip, stopIndex) {
  const stops = synchronizeTripStops(trip);
  const incoming = trip.days[stopIndex - 1];
  const outgoing = trip.days[stopIndex];
  const stop = stops[stopIndex];
  if (incoming && stop) {
    incoming.travelEndDate = stop.arrivalDate || incoming.travelEndDate || "";
  }
  if (outgoing && stop) {
    outgoing.travelStartDate = stop.departureDate || outgoing.travelStartDate || "";
  }
}

function normalizeIsoDateRange(firstIso, secondIso) {
  const first = isoDateValue(firstIso);
  const second = isoDateValue(secondIso);
  if (!first || !second) return null;
  return first <= second
    ? { start: first, end: second }
    : { start: second, end: first };
}

function isoDateInRange(iso, startIso, endIso) {
  const range = normalizeIsoDateRange(startIso, endIso);
  const value = isoDateValue(iso);
  return Boolean(value && range && value >= range.start && value <= range.end);
}

function calendarMonthDates(viewDate) {
  if (!(viewDate instanceof Date) || Number.isNaN(viewDate.getTime())) return [];
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
    return {
      date,
      iso: dateToIso(date),
      outsideMonth: date.getMonth() !== month
    };
  });
}
