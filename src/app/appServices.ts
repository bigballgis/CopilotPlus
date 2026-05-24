/** Application services — aggregates platform + feature modules */

import * as vscode from 'vscode';
import { createPlatformServices, PlatformServices } from '../platform/services';
import { PrimaryAgent } from '../agents/primaryAgent';
import { SubAgentRunner } from '../agents/subAgentRunner';
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
import { SkillService } from '../extensibility/skillService';
import { IndexManager } from '../context/indexManager';
import { DeployService } from '../deploy/deployService';
import { DeployExecutor } from '../deploy/deployExecutor';
import { DeployOrchestrator } from '../deploy/deployOrchestrator';
import { LocalEmbeddingAddon } from '../context/localEmbeddingAddon';
import { ResponseCacheService } from '../editing/responseCacheService';
import { ResponseCacheInvalidation } from '../editing/responseCacheInvalidation';
import { ComposerService } from '../editing/composer';
import { ConversationSummarizer } from '../context/conversationSummarizer';
import { McpService } from '../extensibility/mcpService';
import { KnowledgeService } from '../knowledge/knowledgeService';
import { SpeculativeService } from '../platform/speculativeService';
import { DesignWorkflowService } from '../workflow/designWorkflowService';
import { BackgroundAgentService } from '../agents/backgroundAgentService';
import type { CiSession } from '../cli/ciSession';

export class AppServices {
  readonly platform: PlatformServices;
  readonly primaryAgent: PrimaryAgent;
  readonly subAgentRunner: SubAgentRunner;
  readonly checkpoints: CheckpointService;
  readonly postEdit: PostEditTracker;
  readonly diffReview: DiffReviewService;
  readonly inlineEdit: InlineEditService;
  readonly decisions: DecisionCenter;
  readonly hooks: HookService;
  readonly skills: SkillService;
  readonly stages: StageManager;
  readonly proposedContent: ProposedContentProvider;
  readonly docs: DocumentTreeService;
  readonly tools: ToolExecutor;
  readonly explorer: ExplorerAgent;
  readonly buildExecutor: BuildExecutor;
  readonly indexManager: IndexManager;
  readonly deploy: DeployService;
  readonly deployExecutor: DeployExecutor;
  readonly deployOrchestrator: DeployOrchestrator;
  readonly summarizer: ConversationSummarizer;
  readonly localEmbeddingAddon: LocalEmbeddingAddon;
  readonly composer: ComposerService;
  readonly responseCache: ResponseCacheService;
  readonly responseCacheInvalidation: ResponseCacheInvalidation;
  readonly mcp: McpService;
  readonly knowledge: KnowledgeService;
  readonly speculative: SpeculativeService;
  readonly designWorkflow: DesignWorkflowService;
  readonly backgroundAgent: BackgroundAgentService;
  private ciSession: CiSession | undefined;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    platform: PlatformServices,
    proposedContent: ProposedContentProvider
  ) {
    this.platform = platform;
    this.proposedContent = proposedContent;
    this.subAgentRunner = new SubAgentRunner(this, context.extensionUri);
    this.primaryAgent = new PrimaryAgent(context.extensionUri, this);
    this.checkpoints = new CheckpointService();
    this.responseCache = new ResponseCacheService(platform);
    this.responseCacheInvalidation = new ResponseCacheInvalidation(this.responseCache);
    const invalidateCache = (rel: string) => {
      void this.responseCacheInvalidation.invalidateFile(rel);
    };
    this.postEdit = new PostEditTracker(invalidateCache);
    this.diffReview = new DiffReviewService(this.checkpoints, proposedContent, invalidateCache);
    this.inlineEdit = new InlineEditService(platform, this.diffReview, this.responseCache);
    this.decisions = new DecisionCenter();
    this.hooks = new HookService(context);
    this.skills = new SkillService(context);
    this.stages = new StageManager(this.hooks);
    this.docs = new DocumentTreeService(this.diffReview);
    this.localEmbeddingAddon = new LocalEmbeddingAddon(
      context,
      () => this.platform.getSettings().embeddingAddonUrl,
      () => this.platform.getSettings().embeddingAddonSha256
    );
    this.indexManager = new IndexManager(platform, this.docs, this.localEmbeddingAddon);
    this.tools = new ToolExecutor(this, this.docs);
    this.explorer = new ExplorerAgent(this, context.extensionUri);
    this.buildExecutor = new BuildExecutor(this, context.extensionUri, this.subAgentRunner);
    this.deploy = new DeployService();
    this.deployExecutor = new DeployExecutor(this);
    this.deployOrchestrator = new DeployOrchestrator(this, context, context.extensionUri);
    this.summarizer = new ConversationSummarizer(this);
    this.composer = new ComposerService(this);
    this.mcp = new McpService(context);
    this.knowledge = new KnowledgeService(context, platform);
    this.speculative = new SpeculativeService(platform);
    this.designWorkflow = new DesignWorkflowService(this);
    this.backgroundAgent = new BackgroundAgentService(this, context.extensionUri, context);
  }

  async initialize(): Promise<void> {
    this.checkpoints.setRetention(this.platform.getSettings().checkpointRetention);
    await this.hooks.initialize();
    await this.skills.initialize();
    this.context.subscriptions.push(
      this.skills.onReload((skills) => {
        this.responseCacheInvalidation.onSkillsReload(skills);
      })
    );
    this.responseCacheInvalidation.onSkillsReload(this.skills.getSkills());
    this.responseCacheInvalidation.register(this.context);
    await this.mcp.initialize();
    await this.knowledge.initialize(this.context);
    await this.stages.load();
    await this.deploy.load();
    this.docs.startWatching(this.context);
    void this.docs.ensureDefaultSystem();
    void this.indexManager.start(this.context);
    this.context.subscriptions.push(
      this.stages.onTransition((from, to) => {
        if (to === 'Deploy') {
          void this.deployOrchestrator.onStageEntered(from);
        }
      })
    );
    this.backgroundAgent.start();
    this.context.subscriptions.push({ dispose: () => this.backgroundAgent.dispose() });
  }

  static async create(context: vscode.ExtensionContext): Promise<AppServices> {
    const platform = await createPlatformServices(context);
    const proposedContent = ProposedContentProvider.register(context);
    const app = new AppServices(context, platform, proposedContent);
    await app.initialize();
    return app;
  }

  getCiSession(): CiSession | undefined {
    return this.ciSession;
  }

  enableCiSession(session: CiSession): void {
    this.ciSession = session;
    this.diffReview.setCiAutoApply(true, (path, operation, before, after) =>
      session.recordDiff(path, operation, before, after)
    );
    this.decisions.setCiResolver(session.resolver);
  }

  disableCiSession(): void {
    this.ciSession = undefined;
    this.diffReview.setCiAutoApply(false);
    this.decisions.setCiResolver(undefined);
  }
}
