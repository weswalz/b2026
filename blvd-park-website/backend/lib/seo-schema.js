// SEO-ops schema — Wave-2 port of Heights' SEO platform (HEIGHTSASTRO/src/lib/db/connection.js's
// ensureSeoOperationsTables(), read in full 2026-07-23) to BLVD's Express/SQLite backend.
//
// Column naming: BLVD's own pre-existing tables (events, pages, redirects, activity_log)
// use camelCase (confirmed by reading backend/init-db.js in full — fromPath/toPath/
// matchType/isActive/seoTitle/ogImage/etc, not snake_case), so this schema follows that
// exact convention rather than Heights' own camelCase-vs-Colorado's-snake_case split —
// BLVD already IS camelCase, so no translation judgment call is needed here, it's a
// direct match to Heights' own naming.
//
// ID strategy: BLVD's own tables are all INTEGER PRIMARY KEY AUTOINCREMENT (events,
// pages, redirects, users — confirmed by reading init-db.js). Heights' SEO tables are
// TEXT PRIMARY KEY (crypto.randomUUID()). Followed BLVD's own convention
// (autoincrement integer ids) for every new table below, since seoResources.js's
// consumers (Express routes returning JSON to the React admin) have no reason to want
// UUIDs over BLVD's own established integer-id + res.json(row) pattern — matching
// existing code, not importing a new one.
function applySeoSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resourceType TEXT NOT NULL,
      resourceId TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      parentPath TEXT,
      taxonomyJson TEXT,
      template TEXT,
      httpStatus INTEGER DEFAULT 200,
      indexState TEXT DEFAULT 'index',
      followState TEXT DEFAULT 'follow',
      googlebotDirectives TEXT,
      maxSnippet INTEGER,
      maxImagePreview TEXT DEFAULT 'large',
      maxVideoPreview INTEGER,
      nosnippet INTEGER DEFAULT 0,
      dataNosnippetSelectors TEXT,
      canonicalUrl TEXT,
      language TEXT DEFAULT 'en-US',
      hreflangJson TEXT,
      breadcrumbTitle TEXT,
      seoTitle TEXT,
      seoDescription TEXT,
      ogTitle TEXT,
      ogDescription TEXT,
      ogImage TEXT,
      ogUrl TEXT,
      twitterCard TEXT DEFAULT 'summary_large_image',
      featuredImage TEXT,
      publishedAt TEXT,
      modifiedAt TEXT,
      expiresAt TEXT,
      author TEXT,
      reviewer TEXT,
      contentOwner TEXT,
      contentIntent TEXT,
      audience TEXT,
      topic TEXT,
      funnelStage TEXT,
      targetQueryNotes TEXT,
      includeSitemap INTEGER DEFAULT 1,
      includeSiteSearch INTEGER DEFAULT 1,
      includeFeeds INTEGER DEFAULT 1,
      includeNavigation INTEGER DEFAULT 1,
      includeRecommendations INTEGER DEFAULT 1,
      schemaType TEXT,
      schemaJson TEXT,
      schemaFieldOverridesJson TEXT,
      factCheckStatus TEXT DEFAULT 'unverified',
      legalApprovalRequired INTEGER DEFAULT 0,
      legalApprovalStatus TEXT DEFAULT 'not_required',
      lastReviewedAt TEXT,
      nextReviewAt TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT,
      UNIQUE(resourceType, resourceId)
    );
    CREATE TABLE IF NOT EXISTS seo_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoResourceId INTEGER NOT NULL,
      revisionNumber INTEGER NOT NULL,
      snapshotJson TEXT NOT NULL,
      changeSummary TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT,
      FOREIGN KEY (seoResourceId) REFERENCES seo_resources(id)
    );
    CREATE TABLE IF NOT EXISTS seo_site_settings (
      id TEXT PRIMARY KEY,
      robotsText TEXT,
      defaultLanguage TEXT DEFAULT 'en-US',
      canonicalOrigin TEXT,
      hostnamePolicy TEXT DEFAULT 'non-www',
      trailingSlashPolicy TEXT DEFAULT 'never',
      lowercasePaths INTEGER DEFAULT 1,
      stripTrackingParameters INTEGER DEFAULT 1,
      trackingParameters TEXT,
      emergencyNoindex INTEGER DEFAULT 0,
      indexNowEnabled INTEGER DEFAULT 0,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_audit_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      baseUrl TEXT NOT NULL,
      status TEXT NOT NULL,
      triggerType TEXT DEFAULT 'manual',
      scopeType TEXT DEFAULT 'all',
      scopePrefix TEXT,
      maxPages INTEGER,
      maxDurationMs INTEGER,
      startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      completedAt TEXT,
      totalUrls INTEGER DEFAULT 0,
      issueCount INTEGER DEFAULT 0,
      summaryJson TEXT,
      error TEXT,
      createdBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_page_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId INTEGER NOT NULL,
      url TEXT NOT NULL,
      statusCode INTEGER,
      contentType TEXT,
      responseTimeMs INTEGER,
      responseBytes INTEGER,
      title TEXT,
      description TEXT,
      canonical TEXT,
      robots TEXT,
      h1Count INTEGER DEFAULT 0,
      schemaCount INTEGER DEFAULT 0,
      imageCount INTEGER DEFAULT 0,
      imagesMissingAlt INTEGER DEFAULT 0,
      internalLinkCount INTEGER DEFAULT 0,
      summaryJson TEXT,
      checkedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (runId) REFERENCES seo_audit_runs(id)
    );
    CREATE TABLE IF NOT EXISTS seo_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId INTEGER,
      fingerprint TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      code TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      evidence TEXT,
      recommendation TEXT,
      status TEXT DEFAULT 'open',
      owner TEXT,
      firstSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolvedAt TEXT,
      FOREIGN KEY (runId) REFERENCES seo_audit_runs(id)
    );
    CREATE TABLE IF NOT EXISTS seo_indexnow_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      responseStatus INTEGER,
      responseBody TEXT,
      submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      submittedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_404_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      queryString TEXT,
      referrer TEXT,
      userAgent TEXT,
      ipAddress TEXT,
      hitCount INTEGER DEFAULT 1,
      firstSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(path, queryString)
    );
    CREATE TABLE IF NOT EXISTS seo_bulk_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      requestJson TEXT NOT NULL,
      previewJson TEXT NOT NULL,
      resultJson TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT,
      appliedAt TEXT,
      appliedBy TEXT,
      rolledBackAt TEXT,
      rolledBackBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_citations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoResourceId INTEGER NOT NULL,
      sourceName TEXT NOT NULL,
      sourceUrl TEXT NOT NULL,
      quotedText TEXT,
      expertName TEXT,
      expertCredentials TEXT,
      disclosureText TEXT,
      relAttributes TEXT,
      displayOrder INTEGER DEFAULT 0,
      lastVerifiedAt TEXT,
      lastVerifiedStatus TEXT,
      lastVerifiedStatusCode INTEGER,
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT,
      FOREIGN KEY (seoResourceId) REFERENCES seo_resources(id)
    );
    CREATE TABLE IF NOT EXISTS seo_signoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoResourceId INTEGER NOT NULL,
      signoffType TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      actorId TEXT,
      actorUsername TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seoResourceId) REFERENCES seo_resources(id)
    );
    CREATE TABLE IF NOT EXISTS seo_checklist_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemKey TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT,
      appliesToResourceType TEXT,
      isRequired INTEGER DEFAULT 1,
      isActive INTEGER DEFAULT 1,
      displayOrder INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_checklist_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoResourceId INTEGER NOT NULL,
      definitionId INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      completedBy TEXT,
      completedAt TEXT,
      notes TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seoResourceId) REFERENCES seo_resources(id),
      FOREIGN KEY (definitionId) REFERENCES seo_checklist_definitions(id),
      UNIQUE(seoResourceId, definitionId)
    );
    CREATE TABLE IF NOT EXISTS seo_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityType TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sameAs TEXT,
      schemaType TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_entity_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoResourceId INTEGER NOT NULL,
      seoEntityId INTEGER NOT NULL,
      role TEXT NOT NULL,
      displayOrder INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT,
      FOREIGN KEY (seoResourceId) REFERENCES seo_resources(id),
      FOREIGN KEY (seoEntityId) REFERENCES seo_entities(id),
      UNIQUE(seoResourceId, seoEntityId, role)
    );
    CREATE TABLE IF NOT EXISTS seo_master_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityTypesJson TEXT NOT NULL,
      name TEXT NOT NULL,
      idSlug TEXT NOT NULL UNIQUE,
      description TEXT,
      propertiesJson TEXT,
      sameAs TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_taxonomy_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      termType TEXT NOT NULL,
      description TEXT,
      parentTermId INTEGER,
      indexEligible INTEGER DEFAULT 1,
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT,
      FOREIGN KEY (parentTermId) REFERENCES seo_taxonomy_terms(id)
    );
    CREATE TABLE IF NOT EXISTS seo_resource_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoResourceId INTEGER NOT NULL,
      termId INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT,
      FOREIGN KEY (seoResourceId) REFERENCES seo_resources(id),
      FOREIGN KEY (termId) REFERENCES seo_taxonomy_terms(id),
      UNIQUE(seoResourceId, termId)
    );
    CREATE TABLE IF NOT EXISTS seo_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId INTEGER NOT NULL,
      sourceUrl TEXT NOT NULL,
      destinationUrl TEXT,
      isExternal INTEGER NOT NULL DEFAULT 0,
      anchorText TEXT,
      context TEXT NOT NULL DEFAULT 'body',
      relNofollow INTEGER NOT NULL DEFAULT 0,
      relSponsored INTEGER NOT NULL DEFAULT 0,
      relUgc INTEGER NOT NULL DEFAULT 0,
      relRaw TEXT,
      canonicalDestination TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      lastVerifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (runId) REFERENCES seo_audit_runs(id)
    );
    CREATE TABLE IF NOT EXISTS seo_crawl_schedule (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      intervalMinutes INTEGER NOT NULL DEFAULT 1440,
      scopeType TEXT NOT NULL DEFAULT 'all',
      scopePrefix TEXT,
      maxPages INTEGER NOT NULL DEFAULT 500,
      maxDurationMs INTEGER NOT NULL DEFAULT 600000,
      lastScheduledRunAt TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS seo_crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auditRunId INTEGER,
      triggerType TEXT NOT NULL,
      status TEXT NOT NULL,
      scopeType TEXT NOT NULL DEFAULT 'all',
      scopePrefix TEXT,
      maxPages INTEGER,
      maxDurationMs INTEGER,
      resourceCount INTEGER,
      issueCount INTEGER,
      startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      completedAt TEXT,
      cancelledAt TEXT,
      cancelledBy TEXT,
      error TEXT,
      createdBy TEXT,
      FOREIGN KEY (auditRunId) REFERENCES seo_audit_runs(id)
    );
    CREATE TABLE IF NOT EXISTS seo_sitemap_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      checkedBy TEXT,
      overallValid INTEGER NOT NULL DEFAULT 0,
      fileCount INTEGER NOT NULL DEFAULT 0,
      validFileCount INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS seo_sitemap_check_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkId INTEGER NOT NULL,
      sitemapKey TEXT NOT NULL,
      url TEXT NOT NULL,
      httpStatus INTEGER,
      wellFormed INTEGER NOT NULL DEFAULT 0,
      urlCount INTEGER NOT NULL DEFAULT 0,
      errorsJson TEXT,
      FOREIGN KEY (checkId) REFERENCES seo_sitemap_checks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_seo_resources_path ON seo_resources(path);
    CREATE INDEX IF NOT EXISTS idx_seo_resources_type ON seo_resources(resourceType, resourceId);
    CREATE INDEX IF NOT EXISTS idx_seo_revisions_resource ON seo_revisions(seoResourceId, revisionNumber DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_audit_runs_started ON seo_audit_runs(startedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_page_checks_run ON seo_page_checks(runId);
    CREATE INDEX IF NOT EXISTS idx_seo_issues_status ON seo_issues(status, severity);
    CREATE INDEX IF NOT EXISTS idx_seo_issues_run ON seo_issues(runId);
    CREATE INDEX IF NOT EXISTS idx_seo_indexnow_submitted ON seo_indexnow_log(submittedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_404_last_seen ON seo_404_log(lastSeenAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_bulk_jobs_created ON seo_bulk_jobs(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_citations_resource ON seo_citations(seoResourceId, displayOrder);
    CREATE INDEX IF NOT EXISTS idx_seo_signoffs_resource ON seo_signoffs(seoResourceId, signoffType, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_checklist_definitions_active ON seo_checklist_definitions(isActive, displayOrder);
    CREATE INDEX IF NOT EXISTS idx_seo_checklist_status_resource ON seo_checklist_status(seoResourceId);
    CREATE INDEX IF NOT EXISTS idx_seo_entities_type ON seo_entities(entityType, isActive);
    CREATE INDEX IF NOT EXISTS idx_seo_entity_references_resource ON seo_entity_references(seoResourceId, displayOrder);
    CREATE INDEX IF NOT EXISTS idx_seo_entity_references_entity ON seo_entity_references(seoEntityId);
    CREATE INDEX IF NOT EXISTS idx_seo_master_entities_slug ON seo_master_entities(idSlug);
    CREATE INDEX IF NOT EXISTS idx_seo_master_entities_active ON seo_master_entities(isActive);
    CREATE INDEX IF NOT EXISTS idx_seo_taxonomy_terms_type ON seo_taxonomy_terms(termType, isActive);
    CREATE INDEX IF NOT EXISTS idx_seo_taxonomy_terms_parent ON seo_taxonomy_terms(parentTermId);
    CREATE INDEX IF NOT EXISTS idx_seo_resource_terms_resource ON seo_resource_terms(seoResourceId);
    CREATE INDEX IF NOT EXISTS idx_seo_resource_terms_term ON seo_resource_terms(termId);
    CREATE INDEX IF NOT EXISTS idx_seo_links_source ON seo_links(sourceUrl);
    CREATE INDEX IF NOT EXISTS idx_seo_links_destination ON seo_links(destinationUrl);
    CREATE INDEX IF NOT EXISTS idx_seo_links_status ON seo_links(status);
    CREATE INDEX IF NOT EXISTS idx_seo_crawl_runs_started ON seo_crawl_runs(startedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_crawl_runs_status ON seo_crawl_runs(status);
    CREATE INDEX IF NOT EXISTS idx_seo_sitemap_checks_checked ON seo_sitemap_checks(checkedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_seo_sitemap_check_files_check ON seo_sitemap_check_files(checkId);
  `);

  db.prepare(`
    INSERT OR IGNORE INTO seo_site_settings (
      id, robotsText, defaultLanguage, canonicalOrigin, hostnamePolicy,
      trailingSlashPolicy, lowercasePaths, stripTrackingParameters,
      trackingParameters, emergencyNoindex, indexNowEnabled, updatedAt, updatedBy
    ) VALUES ('default', NULL, 'en-US', ?, 'non-www', 'never', 1, 1, ?, 0, 0, CURRENT_TIMESTAMP, 'system')
  `).run(
    process.env.FRONTEND_URL || 'https://blvdpark.com',
    'utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid,fbclid,msclkid'
  );

  db.prepare(`
    INSERT OR IGNORE INTO seo_crawl_schedule (
      id, enabled, intervalMinutes, scopeType, scopePrefix, maxPages, maxDurationMs, updatedAt, updatedBy
    ) VALUES ('default', 0, 1440, 'all', NULL, 500, 600000, CURRENT_TIMESTAMP, 'system')
  `).run();
}

module.exports = { applySeoSchema };
