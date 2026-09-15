import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  Logger,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { correlationFields } from '../observability/request-context';
import { ModelProviderError } from '../ai/model-provider.error';
import type { ModelProviderErrorCode } from '../ai/model-provider.error';
import { ResearchPlanService } from './research-plan.service';
import type { ResearchPlanInput } from './research-plan.service';
import type { ResearchPlan } from './research-plan.schema';

// Transport input is distinct from the generated ResearchPlan output schema.
const ResearchPlanRequestSchema = z.object({
  objective: z.string().trim().min(1),
  constraints: z.array(z.string().trim().min(1)).optional(),
});

const providerHttpErrors: Record<
  ModelProviderErrorCode,
  { status: number; message: string }
> = {
  TIMEOUT: { status: 504, message: 'Research planning timed out' },
  UNAVAILABLE: {
    status: 503,
    message: 'Research planning is temporarily unavailable',
  },
  INVALID_OUTPUT: {
    status: 502,
    message: 'Research planning returned invalid output',
  },
  REFUSED: { status: 422, message: 'Research planning request was declined' },
  CONFIGURATION: { status: 500, message: 'Internal Server Error' },
  INTERNAL: { status: 500, message: 'Internal Server Error' },
};

@Controller('research')
export class ResearchController {
  private readonly logger = new Logger(ResearchController.name);
  constructor(private readonly researchPlanService: ResearchPlanService) {}

  @Post('plan')
  @HttpCode(200)
  async generatePlan(@Body() body: unknown): Promise<ResearchPlan> {
    const parsed = ResearchPlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid research plan request');
    }
    const input: ResearchPlanInput = {
      objective: parsed.data.objective,
      constraints: parsed.data.constraints,
    };
    try {
      return await this.researchPlanService.generatePlan(input);
    } catch (error) {
      const code =
        error instanceof ModelProviderError ? error.code : 'INTERNAL';
      const mapped = providerHttpErrors[code];
      this.logger.warn({
        event: 'research_plan_failed',
        ...correlationFields(),
        code,
        status: mapped.status,
      });
      if (mapped.status === 500) throw new InternalServerErrorException();
      throw new HttpException(
        { statusCode: mapped.status, code, message: mapped.message },
        mapped.status,
      );
    }
  }
}
