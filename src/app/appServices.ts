/** Application services — aggregates platform + feature modules */

import * as vscode from 'vscode';
import { createPlatformServices, PlatformServices } from '../platform/services';
import { PrimaryAgent } from '../agents/primaryAgent';
import { DiffReviewService } from '../editing/diffReview';
import { CheckpointService } from '../editing/checkpoint';
import { ProposedContentProvider } from '../editing/proposedContentProvider';
import { InlineEditService } from '../editing/inlineEdit';
import { DecisionCenter } from '../interaction/decisionCenter';
import { StageManager } from '../workflow/stageManager';
import { DocumentTreeService } from '../docs/documentTreeService';
import { ToolExecutor } from '../tools/executor';

export class AppServices {
  readonly platform: PlatformServices;
  readonly primaryAgent: PrimaryAgent;
  readonly checkpoints: CheckpointService;
  readonly diffReview: DiffReviewService;
  readonly inlineEdit: InlineEditService;
  readonly decisions: DecisionCenter;
  readonly stages: StageManager;
  readonly proposedContent: ProposedContentProvider;
  readonly docs: DocumentTreeService;
  readonly tools: ToolExecutor;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    platform: PlatformServices,
    proposedContent: ProposedContentProvider
  ) {
    this.platform = platform;
    this.proposedContent = proposedContent;
    this.primaryAgent = new PrimaryAgent(context.extensionUri, platform);
    this.checkpoints = new CheckpointService();
    this.diffReview = new DiffReviewService(this.checkpoints, proposedContent);
    this.inlineEdit = new InlineEditService(platform, this.diffReview);
    this.decisions = new DecisionCenter();
    this.stages = new StageManager();
    this.docs = new DocumentTreeService(this.diffReview);
    this.tools = new ToolExecutor(this, this.docs);
  }

  async initialize(): Promise<void> {
    this.checkpoints.setRetention(this.platform.getSettings().checkpointRetention);
    await this.stages.load();
    this.docs.startWatching(this.context);
    void this.docs.ensureDefaultSystem();
  }

  static async create(context: vscode.ExtensionContext): Promise<AppServices> {
    const platform = await createPlatformServices(context);
    const proposedContent = ProposedContentProvider.register(context);
    const app = new AppServices(context, platform, proposedContent);
    await app.initialize();
    return app;
  }
}
