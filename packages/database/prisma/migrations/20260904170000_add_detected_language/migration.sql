-- The provider detects the spoken/source language after processing. Existing analyses remain
-- unknown because their original model response did not persist this field.
CREATE TYPE "DetectedLanguage" AS ENUM ('AR', 'EN', 'OTHER');

ALTER TABLE "VideoAnalysis"
ADD COLUMN "detectedLanguage" "DetectedLanguage";
