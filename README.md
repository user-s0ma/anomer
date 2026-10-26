# Anomer

Point at a change in your shop's numbers ("Why did orders drop last week?") and Anomer finds the causes and how much each one contributed.

Built for the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026), starting from an empty repository on Oct 27.

## Built during the hackathon

- The analysis: candidate causes shifted by 0–7 days, a sparse regression (Lasso) with time-ordered cross-validation, and a breakdown with a range for each cause (`src/lib/analysis/`)
- The Muse Spark flow: reading the question, setting aside numbers that cannot be causes, and explaining the computed breakdown (`src/lib/ai/`)
- The data sources: simulators shaped like the Meta Marketing API, the Instagram Graph API and a shop's orders, and real weather from NOAA (`src/lib/sources/`)

## License

[Apache License 2.0](LICENSE).
