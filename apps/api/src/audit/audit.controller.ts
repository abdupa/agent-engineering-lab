import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { correlationFields } from '../observability/request-context';
import type { AgentRunErrorCode } from '../agent/agent-run.error';
import { AuditService } from './audit.service';
import { AUDIT_WORKSPACE } from './audit.tokens';
import type { Workspace } from './workspace';
import type { Finding } from './finding.schema';

/**
 * The request carries no path. The audited root is configuration, not input, so the
 * transport surface offers nothing to point somewhere else.
 */
const AuditRequestSchema = z.object({
  rubric: z.string().trim().min(1).max(2000).optional(),
});

export interface AuditResponse {
  status: 'complete' | 'incomplete';
  reason?: AgentRunErrorCode;
  summary: string;
  toolCalls: number;
  findings: Finding[];
}

/** Applied only when the run produced nothing; partial work is delivered instead. */
const emptyFailureStatus: Record<AgentRunErrorCode, number> = {
  TIMEOUT: 504,
  DECISION_FAILED: 502,
  INVALID_DECISION: 502,
  CANCELLED: 503,
  LOOP_LIMIT: 200,
  INVALID_INPUT: 500,
  INTERNAL: 500,
};

const failureMessages: Record<AgentRunErrorCode, string> = {
  TIMEOUT: 'Audit timed out',
  DECISION_FAILED: 'Audit reasoning failed',
  INVALID_DECISION: 'Audit produced an invalid decision',
  CANCELLED: 'Audit was cancelled',
  LOOP_LIMIT: 'Audit reached its step limit',
  INVALID_INPUT: 'Internal Server Error',
  INTERNAL: 'Internal Server Error',
};

@Controller('audit')
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(
    private readonly auditService: AuditService,
    @Inject(AUDIT_WORKSPACE) private readonly workspace: Workspace,
  ) {}

  @Post()
  @HttpCode(200)
  async runAudit(@Body() body: unknown): Promise<AuditResponse> {
    const parsed = AuditRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid audit request');

    const { report, failure } = await this.auditService.audit(
      this.workspace,
      parsed.data.rubric,
    );

    if (!failure) {
      return {
        status: 'complete',
        summary: report.summary,
        toolCalls: report.toolCalls,
        findings: report.findings,
      };
    }

    const status = emptyFailureStatus[failure.code];
    this.logger.warn({
      event: 'audit_incomplete',
      ...correlationFields(),
      code: failure.code,
      findings: report.findings.length,
    });

    // Findings already recorded are real work. A run that produced some is returned as
    // an incomplete result rather than discarded behind an error status.
    if (report.findings.length > 0 || status === 200) {
      return {
        status: 'incomplete',
        reason: failure.code,
        summary: report.summary,
        toolCalls: report.toolCalls,
        findings: report.findings,
      };
    }

    if (status === 500) throw new InternalServerErrorException();
    throw new HttpException(
      {
        statusCode: status,
        code: failure.code,
        message: failureMessages[failure.code],
      },
      status,
    );
  }
}
