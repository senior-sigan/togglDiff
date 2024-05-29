const HOUR = 3600;
const MINUTE = 60;

/**
 * Convert seconds to HH:MM:SS
 * If seconds exceeds 24 hours, hours will be greater than 24 (30:05:10)
 *
 * @param {number} seconds
 * @returns {string}
 */
export function secondsToHms(time: number) {
  const hours = Math.floor(time / HOUR);
  const minutes = Math.floor((time - (hours * HOUR)) / MINUTE);
  const seconds = time - (hours * HOUR) - (minutes * MINUTE);

  return hours.toString().padStart(2, "0") + ":" +
    minutes.toString().padStart(2, "0") + ":" +
    seconds.toString().padStart(2, "0");
}
