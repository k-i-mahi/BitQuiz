-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('LINK', 'LOCAL');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "mediaPlaying" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaRestartCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "mediaKind" "MediaKind",
ADD COLUMN     "mediaOnPhones" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaRef" TEXT,
ADD COLUMN     "mediaSource" "MediaSource";
