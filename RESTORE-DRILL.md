# Restore Drill

## Run details

| Field             |                         Measured value |
| ----------------- | -------------------------------------: |
| Date              |                             2026-10-07 |
| Backup file       | `marketplace_2026-10-07_18-25-57.dump` |
| Backup size       |             3,969,920 bytes (3.79 MiB) |
| Source checksum   |                   `100000\|5000050000` |
| Restored checksum |                   `100000\|5000050000` |
| Measured RTO      |                          3.234 seconds |
| Calculated RPO    |                         up to 24 hours |
| Result            |                                `MATCH` |

## Interpretation

The measured **RTO (Recovery Time Objective)** for this local drill is 3.234
seconds. The measurement starts before the clean volume and PostgreSQL container
are created and ends after the restored data checksum is calculated.

The calculated **RPO (Recovery Point Objective)** is up to 24 hours because
`backup.cron` runs once per night. In the worst case, a failure can happen just
before the next scheduled backup and changes made since the previous nightly
backup would be lost.

The drill was executed twice. Both runs restored the latest custom-format dump
into a newly created volume, produced the same `orders` row count and ID sum, and
removed the temporary container and volume after completion.
