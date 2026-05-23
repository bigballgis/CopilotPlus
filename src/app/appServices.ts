/** Application services — aggregates platform + feature modules */

import * as vscode from 'vscode';
import { createPlatformServices, PlatformServices } from '../platform/services';
import { PrimaryAgent } from '../agents/primaryAgent';
import { ExplorerAgent } from '../agents/explorerAgent';
import { PostEditTracker } from '../agents/postEditVerification';
import { DiffReviewService } from '../editing/diffReview';
import { CheckpointService } from '../editing/checkpoint';
import { ProposedContentProvider } from '../editing/proposedContentProvider';
import { InlineEditService } from '../editing/inlineEdit';
import { DecisionCenter } from '../interaction/decisionCenter';
import { StageManager } from '../workflow/stageManager';
import { DocumentTreeService } from '../docs/documentTreeService';
import { ToolExecutor } from '../tools/executor';
import { BuildExecutor } from '../workflow/buildExecutor';
import { HookService } from '../extensibility/hookService';
import { IndexManager } from '../context/indexManager';
import { DeployService } from '../deploy/deployService';

export class AppServices {
  readonly platform: PlatformServices;
  readonly primaryAgent: PrimaryAgent;
  readonly checkpoints: CheckpointService;
  readonly postEdit: PostEditTracker;
  readonly diffReview: DiffReviewService;
  readonly inlineEdit: InlineEditService;
  readonly decisions: DecisionCenter;
  readonly hooks: HookService;
  readonly stages: StageManager;
  readonly proposedContent: ProposedContentProvider;
  readonly docs: DocumentTreeService;
  readonly tools: ToolExecutor;
  readonly explorer: ExplorerAgent;
  readonly buildExecutor: BuildExecutor;
  readonly indexManager: IndexManager;
  readonly deploy: DeployService;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    platform: PlatformServices,
    proposedContent: ProposedContentProvider
  ) {
    this.platform = platform;
    this.proposedContent = proposedContent;
    this.primaryAgent = new PrimaryAgent(context.extensionUri, platform);
    this.checkpoints = new CheckpointService();
    this.postEdit = new PostEditTracker();
    this.diffReview = new DiffReviewService(this.checkpoints, proposedContent);
    this.inlineEdit = new InlineEditService(platform, this.diffReview);
    this.decisions = new DecisionCenter();
    this.hooks = new HookService(context);
    this.stages = new StageManager(this.hooks);
    this.docs = new DocumentTreeService(this.diffReview);
    this.indexManager = new IndexManager(platform, this.docs);
    this.tools = new ToolExecutor(this, this.docs);
    this.explorer = new ExplorerAgent(this, context.extensionUri);
    this.buildExecutor = new BuildExecutor(this, context.extensionUri);
    this.deploy = new DeployService();
  }

  async initialize(): Promise<void> {
    this.checkpoints.setRetention(this.platform.getSettings().checkpointRetention);
    await this.hooks.initialize();
    await this.stages.load();
    await this.deploy.load();
    this.docs.startWatching(this.context);
    void this.docs.ensureDefaultSystem();
    void this.indexManager.start(this.context);
  }

  static async create(context: vscode.ExtensionContext): Promise<AppServices> {
    const platform = await createPlatformServices(context);
    const proposedContent = ProposedContentProvider.register(context);
    const app = new AppServices(context, platform, proposedContent);
    await app.initialize();
    return app;
  }
}
