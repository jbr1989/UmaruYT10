export function formatNum(n) {
    return n?.toLocaleString?.() ?? String(n);
}

export function formatDuration(totalDurationSeconds: number) {

    const SECONDS_PER_MINUTE = 60;
    const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
    const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
    const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY; // aproximación
    const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY; // aproximación

    let remaining = totalDurationSeconds;
    const years = Math.floor(remaining / SECONDS_PER_YEAR);
    remaining %= SECONDS_PER_YEAR;
    const months = Math.floor(remaining / SECONDS_PER_MONTH);
    remaining %= SECONDS_PER_MONTH;
    const days = Math.floor(remaining / SECONDS_PER_DAY);
    remaining %= SECONDS_PER_DAY;
    const hours = Math.floor(remaining / SECONDS_PER_HOUR);
    remaining %= SECONDS_PER_HOUR;
    const minutes = Math.floor(remaining / SECONDS_PER_MINUTE);

    function unitLabel(value: number, singular: string, plural: string) {
    return value === 1 ? singular : plural;
    }

    const parts = [];
    if (years) parts.push(`${years} ${unitLabel(years, "año", "años")}`);
    if (months) parts.push(`${months} ${unitLabel(months, "mes", "meses")}`);
    if (days) parts.push(`${days} ${unitLabel(days, "día", "días")}`);
    if (hours) parts.push(`${hours} ${unitLabel(hours, "hora", "horas")}`);
    if (minutes)
    parts.push(`${minutes} ${unitLabel(minutes, "minuto", "minutos")}`);
    const totalHumanReadable = parts.join(", ");

    return totalHumanReadable;

}