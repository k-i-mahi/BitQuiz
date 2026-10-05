-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'LOBBY', 'LIVE', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'SHOWN', 'OPEN', 'CLOSED', 'REVEALED', 'VOID');

-- CreateEnum
CREATE TYPE "DisplayMode" AS ENUM ('LOBBY', 'QUESTION', 'LEADERBOARD', 'HOLD', 'FINAL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'OPERATOR',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "rollMinLength" INTEGER NOT NULL DEFAULT 7,
    "rollMaxLength" INTEGER NOT NULL DEFAULT 7,
    "rollDigitsOnly" BOOLEAN NOT NULL DEFAULT true,
    "allowLateJoin" BOOLEAN NOT NULL DEFAULT true,
    "displayMode" "DisplayMode" NOT NULL DEFAULT 'LOBBY',
    "holdMessage" TEXT,
    "leaderboardFrozenAt" TIMESTAMP(3),
    "currentQuestionId" UUID,
    "projectorToken" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "defaultTimeLimitSec" INTEGER NOT NULL DEFAULT 20,
    "defaultMaxPoints" INTEGER NOT NULL DEFAULT 100,
    "defaultMinPoints" INTEGER NOT NULL DEFAULT 50,
    "wrongPenalty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "code" TEXT,
    "codeLanguage" TEXT,
    "options" JSONB NOT NULL,
    "correctOptionId" TEXT NOT NULL,
    "explanation" TEXT,
    "timeLimitSec" INTEGER,
    "maxPoints" INTEGER,
    "minPoints" INTEGER,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "shownAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "roll" TEXT NOT NULL,
    "tokenHash" TEXT,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "kicked" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "optionId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseMs" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" BIGSERIAL NOT NULL,
    "competitionId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_organizationId_idx" ON "AdminUser"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_joinCode_key" ON "Competition"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_projectorToken_key" ON "Competition"("projectorToken");

-- CreateIndex
CREATE INDEX "Competition_organizationId_status_idx" ON "Competition"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Round_competitionId_order_idx" ON "Round"("competitionId", "order");

-- CreateIndex
CREATE INDEX "Question_roundId_order_idx" ON "Question"("roundId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_tokenHash_key" ON "Participant"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_competitionId_roll_key" ON "Participant"("competitionId", "roll");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_participantId_questionId_key" ON "Answer"("participantId", "questionId");

-- CreateIndex
CREATE INDEX "ActionLog_competitionId_at_idx" ON "ActionLog"("competitionId", "at");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
