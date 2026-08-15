export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  platform: {
    Tables: {
      airtableSyncState: {
        Row: {
          id: boolean
          lastError: string | null
          lastManualRunAt: string | null
          lastManualRunBy: string | null
          lastRefusals: Json | null
          lastStatus: string | null
          lastSyncedAt: string | null
          rowsArchived: number
          rowsRefused: number
          rowsUpserted: number
          runExpiresAt: string | null
          runStartedAt: string | null
        }
        Insert: {
          id?: boolean
          lastError?: string | null
          lastManualRunAt?: string | null
          lastManualRunBy?: string | null
          lastRefusals?: Json | null
          lastStatus?: string | null
          lastSyncedAt?: string | null
          rowsArchived?: number
          rowsRefused?: number
          rowsUpserted?: number
          runExpiresAt?: string | null
          runStartedAt?: string | null
        }
        Update: {
          id?: boolean
          lastError?: string | null
          lastManualRunAt?: string | null
          lastManualRunBy?: string | null
          lastRefusals?: Json | null
          lastStatus?: string | null
          lastSyncedAt?: string | null
          rowsArchived?: number
          rowsRefused?: number
          rowsUpserted?: number
          runExpiresAt?: string | null
          runStartedAt?: string | null
        }
        Relationships: []
      }
      apps: {
        Row: {
          contentActioner: string | null
          contentResolver: string | null
          createdAt: string
          displayName: string
          id: string
          schemaName: string
          slug: string
        }
        Insert: {
          contentActioner?: string | null
          contentResolver?: string | null
          createdAt?: string
          displayName: string
          id?: string
          schemaName: string
          slug: string
        }
        Update: {
          contentActioner?: string | null
          contentResolver?: string | null
          createdAt?: string
          displayName?: string
          id?: string
          schemaName?: string
          slug?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          airtableRecordId: string | null
          id: string
          meetingId: string
          method: Database["platform"]["Enums"]["checkInMethod"]
          recordedAt: string
          recordedBy: string | null
          userId: string
          workshopId: string | null
        }
        Insert: {
          airtableRecordId?: string | null
          id?: string
          meetingId: string
          method: Database["platform"]["Enums"]["checkInMethod"]
          recordedAt?: string
          recordedBy?: string | null
          userId: string
          workshopId?: string | null
        }
        Update: {
          airtableRecordId?: string | null
          id?: string
          meetingId?: string
          method?: Database["platform"]["Enums"]["checkInMethod"]
          recordedAt?: string
          recordedBy?: string | null
          userId?: string
          workshopId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_meetingId_fkey"
            columns: ["meetingId"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_workshopId_meetingId_fkey"
            columns: ["workshopId", "meetingId"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id", "meetingId"]
          },
        ]
      }
      ballotRankings: {
        Row: {
          ballotId: string
          candidateTeamId: string
          rank: number
        }
        Insert: {
          ballotId: string
          candidateTeamId: string
          rank: number
        }
        Update: {
          ballotId?: string
          candidateTeamId?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "ballotRankings_ballotId_fkey"
            columns: ["ballotId"]
            isOneToOne: false
            referencedRelation: "ballots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ballotRankings_candidateTeamId_fkey"
            columns: ["candidateTeamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ballots: {
        Row: {
          castAt: string
          castBy: string
          electionId: string
          electorate: Database["platform"]["Enums"]["electionElectorate"]
          id: string
          teamId: string | null
        }
        Insert: {
          castAt?: string
          castBy: string
          electionId: string
          electorate: Database["platform"]["Enums"]["electionElectorate"]
          id?: string
          teamId?: string | null
        }
        Update: {
          castAt?: string
          castBy?: string
          electionId?: string
          electorate?: Database["platform"]["Enums"]["electionElectorate"]
          id?: string
          teamId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ballots_electionId_electorate_fkey"
            columns: ["electionId", "electorate"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id", "electorate"]
          },
          {
            foreignKeyName: "ballots_electionId_fkey"
            columns: ["electionId"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ballots_teamId_fkey"
            columns: ["teamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          airtableRecordId: string | null
          deletedAt: string | null
          id: string
          judgingMeetingId: string | null
          judgingStartsAt: string | null
          maxTeamSize: number | null
          requirementCount: number | null
          slug: string
          workshopId: string
        }
        Insert: {
          airtableRecordId?: string | null
          deletedAt?: string | null
          id?: string
          judgingMeetingId?: string | null
          judgingStartsAt?: string | null
          maxTeamSize?: number | null
          requirementCount?: number | null
          slug: string
          workshopId: string
        }
        Update: {
          airtableRecordId?: string | null
          deletedAt?: string | null
          id?: string
          judgingMeetingId?: string | null
          judgingStartsAt?: string | null
          maxTeamSize?: number | null
          requirementCount?: number | null
          slug?: string
          workshopId?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_judgingMeetingId_fkey"
            columns: ["judgingMeetingId"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_workshopId_fkey"
            columns: ["workshopId"]
            isOneToOne: true
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      competitionStandings: {
        Row: {
          competitionId: string
          electionPoints: number
          placement: number
          requirementCount: number
          requirementPoints: number
          requirementsMet: number
          resolvedBy: string | null
          teamId: string
          totalPoints: number | null
        }
        Insert: {
          competitionId: string
          electionPoints: number
          placement: number
          requirementCount: number
          requirementPoints: number
          requirementsMet: number
          resolvedBy?: string | null
          teamId: string
          totalPoints?: number | null
        }
        Update: {
          competitionId?: string
          electionPoints?: number
          placement?: number
          requirementCount?: number
          requirementPoints?: number
          requirementsMet?: number
          resolvedBy?: string | null
          teamId?: string
          totalPoints?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitionStandings_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitionStandings_teamId_fkey"
            columns: ["teamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      contentTypes: {
        Row: {
          appId: string
          authorColumn: string | null
          contentType: string | null
          createdAt: string
          id: string
          label: string | null
          quarantineEffect:
            | Database["platform"]["Enums"]["quarantineEffect"]
            | null
          snapshotColumns: string[] | null
          tableName: string
          urlTemplate: string | null
          visibility: Database["platform"]["Enums"]["contentVisibility"] | null
        }
        Insert: {
          appId: string
          authorColumn?: string | null
          contentType?: string | null
          createdAt?: string
          id?: string
          label?: string | null
          quarantineEffect?:
            | Database["platform"]["Enums"]["quarantineEffect"]
            | null
          snapshotColumns?: string[] | null
          tableName: string
          urlTemplate?: string | null
          visibility?: Database["platform"]["Enums"]["contentVisibility"] | null
        }
        Update: {
          appId?: string
          authorColumn?: string | null
          contentType?: string | null
          createdAt?: string
          id?: string
          label?: string | null
          quarantineEffect?:
            | Database["platform"]["Enums"]["quarantineEffect"]
            | null
          snapshotColumns?: string[] | null
          tableName?: string
          urlTemplate?: string | null
          visibility?: Database["platform"]["Enums"]["contentVisibility"] | null
        }
        Relationships: [
          {
            foreignKeyName: "contentTypes_appId_fkey"
            columns: ["appId"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      credentialRoles: {
        Row: {
          credentialId: string
          roleId: string
        }
        Insert: {
          credentialId: string
          roleId: string
        }
        Update: {
          credentialId?: string
          roleId?: string
        }
        Relationships: [
          {
            foreignKeyName: "credentialRoles_credentialId_credentials_id_fkey"
            columns: ["credentialId"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentialRoles_roleId_roles_id_fkey"
            columns: ["roleId"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          createdAt: string
          createdBy: string | null
          description: string | null
          email: string | null
          id: string
          name: string
          passwordSecretId: string | null
          totpSecretId: string | null
          type: Database["platform"]["Enums"]["credentialType"]
        }
        Insert: {
          createdAt?: string
          createdBy?: string | null
          description?: string | null
          email?: string | null
          id?: string
          name: string
          passwordSecretId?: string | null
          totpSecretId?: string | null
          type: Database["platform"]["Enums"]["credentialType"]
        }
        Update: {
          createdAt?: string
          createdBy?: string | null
          description?: string | null
          email?: string | null
          id?: string
          name?: string
          passwordSecretId?: string | null
          totpSecretId?: string | null
          type?: Database["platform"]["Enums"]["credentialType"]
        }
        Relationships: []
      }
      docsPages: {
        Row: {
          description: string | null
          id: string
          path: string
          plainText: string
          search: unknown
          title: string
          updatedAt: string
        }
        Insert: {
          description?: string | null
          id?: string
          path: string
          plainText: string
          search?: unknown
          title: string
          updatedAt?: string
        }
        Update: {
          description?: string | null
          id?: string
          path?: string
          plainText?: string
          search?: unknown
          title?: string
          updatedAt?: string
        }
        Relationships: []
      }
      electionResults: {
        Row: {
          bordaScore: number
          electionId: string
          placement: number
          scaled: number
          teamId: string
        }
        Insert: {
          bordaScore: number
          electionId: string
          placement: number
          scaled: number
          teamId: string
        }
        Update: {
          bordaScore?: number
          electionId?: string
          placement?: number
          scaled?: number
          teamId?: string
        }
        Relationships: [
          {
            foreignKeyName: "electionResults_electionId_fkey"
            columns: ["electionId"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electionResults_teamId_fkey"
            columns: ["teamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      elections: {
        Row: {
          airtableRecordId: string | null
          closesAt: string
          competitionId: string
          electorate: Database["platform"]["Enums"]["electionElectorate"]
          id: string
          opensAt: string
          purpose: Database["platform"]["Enums"]["electionPurpose"]
          slug: string
          status: Database["platform"]["Enums"]["electionStatus"]
          title: string
        }
        Insert: {
          airtableRecordId?: string | null
          closesAt: string
          competitionId: string
          electorate: Database["platform"]["Enums"]["electionElectorate"]
          id?: string
          opensAt: string
          purpose?: Database["platform"]["Enums"]["electionPurpose"]
          slug: string
          status?: Database["platform"]["Enums"]["electionStatus"]
          title: string
        }
        Update: {
          airtableRecordId?: string | null
          closesAt?: string
          competitionId?: string
          electorate?: Database["platform"]["Enums"]["electionElectorate"]
          id?: string
          opensAt?: string
          purpose?: Database["platform"]["Enums"]["electionPurpose"]
          slug?: string
          status?: Database["platform"]["Enums"]["electionStatus"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "elections_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      envAccessLog: {
        Row: {
          at: string
          environmentId: string
          id: number
          keysFetched: string[]
          userId: string
        }
        Insert: {
          at?: string
          environmentId: string
          id?: never
          keysFetched: string[]
          userId: string
        }
        Update: {
          at?: string
          environmentId?: string
          id?: never
          keysFetched?: string[]
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "envAccessLog_environmentId_fkey"
            columns: ["environmentId"]
            isOneToOne: false
            referencedRelation: "sandboxEnvironments"
            referencedColumns: ["id"]
          },
        ]
      }
      envVars: {
        Row: {
          environmentId: string
          key: string
          secretId: string | null
          updatedAt: string
          updatedBy: string
          value: string | null
          visibility: Database["platform"]["Enums"]["envVarVisibility"]
        }
        Insert: {
          environmentId: string
          key: string
          secretId?: string | null
          updatedAt?: string
          updatedBy: string
          value?: string | null
          visibility: Database["platform"]["Enums"]["envVarVisibility"]
        }
        Update: {
          environmentId?: string
          key?: string
          secretId?: string | null
          updatedAt?: string
          updatedBy?: string
          value?: string | null
          visibility?: Database["platform"]["Enums"]["envVarVisibility"]
        }
        Relationships: [
          {
            foreignKeyName: "envVars_environmentId_fkey"
            columns: ["environmentId"]
            isOneToOne: false
            referencedRelation: "sandboxEnvironments"
            referencedColumns: ["id"]
          },
        ]
      }
      exportAudit: {
        Row: {
          createdAt: string
          filters: Json
          id: string
          kind: string
          rowCount: number | null
          userId: string | null
        }
        Insert: {
          createdAt?: string
          filters?: Json
          id?: string
          kind: string
          rowCount?: number | null
          userId?: string | null
        }
        Update: {
          createdAt?: string
          filters?: Json
          id?: string
          kind?: string
          rowCount?: number | null
          userId?: string | null
        }
        Relationships: []
      }
      leaderboardProfiles: {
        Row: {
          allTimePoints: number
          allTimeRanking: number | null
          avatarUrl: string | null
          currentYearPoints: number
          currentYearRanking: number | null
          githubId: string
          githubLogin: string
        }
        Insert: {
          allTimePoints?: number
          allTimeRanking?: number | null
          avatarUrl?: string | null
          currentYearPoints?: number
          currentYearRanking?: number | null
          githubId: string
          githubLogin: string
        }
        Update: {
          allTimePoints?: number
          allTimeRanking?: number | null
          avatarUrl?: string | null
          currentYearPoints?: number
          currentYearRanking?: number | null
          githubId?: string
          githubLogin?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          airtableRecordId: string | null
          attendanceFormUrl: string | null
          deletedAt: string | null
          endsAt: string
          id: string
          location: string | null
          name: string
          slug: string
          startsAt: string
        }
        Insert: {
          airtableRecordId?: string | null
          attendanceFormUrl?: string | null
          deletedAt?: string | null
          endsAt: string
          id?: string
          location?: string | null
          name: string
          slug: string
          startsAt: string
        }
        Update: {
          airtableRecordId?: string | null
          attendanceFormUrl?: string | null
          deletedAt?: string | null
          endsAt?: string
          id?: string
          location?: string | null
          name?: string
          slug?: string
          startsAt?: string
        }
        Relationships: []
      }
      oauthRegistrations: {
        Row: {
          clientId: string
          type: Database["platform"]["Enums"]["oauthRegistrationType"]
          userId: string
        }
        Insert: {
          clientId: string
          type?: Database["platform"]["Enums"]["oauthRegistrationType"]
          userId: string
        }
        Update: {
          clientId?: string
          type?: Database["platform"]["Enums"]["oauthRegistrationType"]
          userId?: string
        }
        Relationships: []
      }
      oauthTestAccounts: {
        Row: {
          createdAt: string
          ownerUserId: string
          testUserId: string
        }
        Insert: {
          createdAt?: string
          ownerUserId: string
          testUserId: string
        }
        Update: {
          createdAt?: string
          ownerUserId?: string
          testUserId?: string
        }
        Relationships: []
      }
      pairwiseTallies: {
        Row: {
          aOverB: number
          bOverA: number
          competitionId: string
          teamA: string
          teamB: string
        }
        Insert: {
          aOverB: number
          bOverA: number
          competitionId: string
          teamA: string
          teamB: string
        }
        Update: {
          aOverB?: number
          bOverA?: number
          competitionId?: string
          teamA?: string
          teamB?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairwiseTallies_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      points: {
        Row: {
          academyPoints: number
          leaderboardProfileId: string
          longestStreakLength: number
          points: number
          projectPoints: number
          streakBonusPoints: number
          streakLength: number
          streakStart: string
          year: number
        }
        Insert: {
          academyPoints?: number
          leaderboardProfileId: string
          longestStreakLength?: number
          points?: number
          projectPoints?: number
          streakBonusPoints?: number
          streakLength?: number
          streakStart: string
          year: number
        }
        Update: {
          academyPoints?: number
          leaderboardProfileId?: string
          longestStreakLength?: number
          points?: number
          projectPoints?: number
          streakBonusPoints?: number
          streakLength?: number
          streakStart?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey"
            columns: ["leaderboardProfileId"]
            isOneToOne: false
            referencedRelation: "leaderboardProfiles"
            referencedColumns: ["githubId"]
          },
        ]
      }
      profile: {
        Row: {
          bio: string | null
          graduationSemester:
            | Database["platform"]["Enums"]["graduationSemester"]
            | null
          graduationYear: number | null
          identitySourcedAt: string | null
          involvementFirstName: string | null
          involvementImportedAt: string | null
          involvementLastName: string | null
          legalFirstName: string | null
          legalLastName: string | null
          preferredName: string
          pronouns: string[] | null
          quarantinedBy: string | null
          roleDescription: string | null
          showDiscord: boolean
          showEmail: boolean
          showGithub: boolean
          showLinkedin: boolean
          ugaEmail: string | null
          userId: string
          viewedConsole: boolean
        }
        Insert: {
          bio?: string | null
          graduationSemester?:
            | Database["platform"]["Enums"]["graduationSemester"]
            | null
          graduationYear?: number | null
          identitySourcedAt?: string | null
          involvementFirstName?: string | null
          involvementImportedAt?: string | null
          involvementLastName?: string | null
          legalFirstName?: string | null
          legalLastName?: string | null
          preferredName: string
          pronouns?: string[] | null
          quarantinedBy?: string | null
          roleDescription?: string | null
          showDiscord?: boolean
          showEmail?: boolean
          showGithub?: boolean
          showLinkedin?: boolean
          ugaEmail?: string | null
          userId: string
          viewedConsole?: boolean
        }
        Update: {
          bio?: string | null
          graduationSemester?:
            | Database["platform"]["Enums"]["graduationSemester"]
            | null
          graduationYear?: number | null
          identitySourcedAt?: string | null
          involvementFirstName?: string | null
          involvementImportedAt?: string | null
          involvementLastName?: string | null
          legalFirstName?: string | null
          legalLastName?: string | null
          preferredName?: string
          pronouns?: string[] | null
          quarantinedBy?: string | null
          roleDescription?: string | null
          showDiscord?: boolean
          showEmail?: boolean
          showGithub?: boolean
          showLinkedin?: boolean
          ugaEmail?: string | null
          userId?: string
          viewedConsole?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_quarantinedBy_fkey"
            columns: ["quarantinedBy"]
            isOneToOne: false
            referencedRelation: "reportResolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      profileLinks: {
        Row: {
          createdAt: string | null
          id: string
          sortOrder: number
          title: string
          url: string
          userId: string
        }
        Insert: {
          createdAt?: string | null
          id?: string
          sortOrder?: number
          title: string
          url: string
          userId: string
        }
        Update: {
          createdAt?: string | null
          id?: string
          sortOrder?: number
          title?: string
          url?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "profileLinks_userId_profile_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["userId"]
          },
          {
            foreignKeyName: "profileLinks_userId_profile_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "profileWithVerification"
            referencedColumns: ["userId"]
          },
        ]
      }
      projects: {
        Row: {
          appId: string | null
          displayName: string
          id: string
          slug: string
          sortOrder: number
        }
        Insert: {
          appId?: string | null
          displayName: string
          id?: string
          slug: string
          sortOrder?: number
        }
        Update: {
          appId?: string | null
          displayName?: string
          id?: string
          slug?: string
          sortOrder?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_appId_fkey"
            columns: ["appId"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      proxyRequestLog: {
        Row: {
          at: string
          credentialId: string
          id: number
          method: string
          path: string
          status: number
        }
        Insert: {
          at?: string
          credentialId: string
          id?: never
          method: string
          path: string
          status: number
        }
        Update: {
          at?: string
          credentialId?: string
          id?: never
          method?: string
          path?: string
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "proxyRequestLog_credentialId_fkey"
            columns: ["credentialId"]
            isOneToOne: false
            referencedRelation: "sandboxCredentials"
            referencedColumns: ["id"]
          },
        ]
      }
      reportCorroborations: {
        Row: {
          createdAt: string
          description: string | null
          id: string
          reason: Database["platform"]["Enums"]["reportReason"]
          reporterUserId: string
          reportId: string
        }
        Insert: {
          createdAt?: string
          description?: string | null
          id?: string
          reason: Database["platform"]["Enums"]["reportReason"]
          reporterUserId: string
          reportId: string
        }
        Update: {
          createdAt?: string
          description?: string | null
          id?: string
          reason?: Database["platform"]["Enums"]["reportReason"]
          reporterUserId?: string
          reportId?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportCorroborations_reportId_fkey"
            columns: ["reportId"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reportReasons: {
        Row: {
          description: string | null
          position: number
          reason: Database["platform"]["Enums"]["reportReason"]
          title: string
        }
        Insert: {
          description?: string | null
          position: number
          reason: Database["platform"]["Enums"]["reportReason"]
          title: string
        }
        Update: {
          description?: string | null
          position?: number
          reason?: Database["platform"]["Enums"]["reportReason"]
          title?: string
        }
        Relationships: []
      }
      reportResolutions: {
        Row: {
          appliedGlobally: boolean
          contentAction: Database["platform"]["Enums"]["contentAction"]
          createdAt: string
          filerAction: Database["platform"]["Enums"]["filerAction"]
          id: string
          moderatorNote: string | null
          moderatorUserId: string
          reportId: string
          subjectAction: Database["platform"]["Enums"]["subjectAction"]
        }
        Insert: {
          appliedGlobally?: boolean
          contentAction: Database["platform"]["Enums"]["contentAction"]
          createdAt?: string
          filerAction: Database["platform"]["Enums"]["filerAction"]
          id?: string
          moderatorNote?: string | null
          moderatorUserId: string
          reportId: string
          subjectAction: Database["platform"]["Enums"]["subjectAction"]
        }
        Update: {
          appliedGlobally?: boolean
          contentAction?: Database["platform"]["Enums"]["contentAction"]
          createdAt?: string
          filerAction?: Database["platform"]["Enums"]["filerAction"]
          id?: string
          moderatorNote?: string | null
          moderatorUserId?: string
          reportId?: string
          subjectAction?: Database["platform"]["Enums"]["subjectAction"]
        }
        Relationships: [
          {
            foreignKeyName: "reportResolutions_reportId_fkey"
            columns: ["reportId"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          appId: string
          contentRef: string
          contentSnapshot: string
          contentType: string
          contentUrl: string | null
          createdAt: string
          description: string | null
          id: string
          reason: Database["platform"]["Enums"]["reportReason"]
          reportedUserId: string
          reporterUserId: string
          resolvedAt: string | null
          status: Database["platform"]["Enums"]["reportStatus"]
        }
        Insert: {
          appId: string
          contentRef: string
          contentSnapshot: string
          contentType: string
          contentUrl?: string | null
          createdAt?: string
          description?: string | null
          id?: string
          reason: Database["platform"]["Enums"]["reportReason"]
          reportedUserId: string
          reporterUserId: string
          resolvedAt?: string | null
          status?: Database["platform"]["Enums"]["reportStatus"]
        }
        Update: {
          appId?: string
          contentRef?: string
          contentSnapshot?: string
          contentType?: string
          contentUrl?: string | null
          createdAt?: string
          description?: string | null
          id?: string
          reason?: Database["platform"]["Enums"]["reportReason"]
          reportedUserId?: string
          reporterUserId?: string
          resolvedAt?: string | null
          status?: Database["platform"]["Enums"]["reportStatus"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_appId_fkey"
            columns: ["appId"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          canAuditBallots: boolean | null
          canCreateCredentials: boolean | null
          canEditAttendance: boolean | null
          canExportStars: boolean | null
          canManageRoles: boolean | null
          canManageSuspensions: boolean | null
          canManageVerification: boolean | null
          canModerate: boolean | null
          canTriggerSync: boolean | null
          canViewAuditLog: boolean | null
          canVoteAsOfficer: boolean | null
          color: string | null
          createdAt: string
          description: string
          discordRoleId: string | null
          discordSyncedColor: number | null
          discordSyncedName: string | null
          id: string
          isLeadership: boolean
          rank: number | null
          roleType: Database["platform"]["Enums"]["roleType"]
          showOnProfile: boolean
          title: string
        }
        Insert: {
          canAuditBallots?: boolean | null
          canCreateCredentials?: boolean | null
          canEditAttendance?: boolean | null
          canExportStars?: boolean | null
          canManageRoles?: boolean | null
          canManageSuspensions?: boolean | null
          canManageVerification?: boolean | null
          canModerate?: boolean | null
          canTriggerSync?: boolean | null
          canViewAuditLog?: boolean | null
          canVoteAsOfficer?: boolean | null
          color?: string | null
          createdAt?: string
          description?: string
          discordRoleId?: string | null
          discordSyncedColor?: number | null
          discordSyncedName?: string | null
          id?: string
          isLeadership?: boolean
          rank?: number | null
          roleType?: Database["platform"]["Enums"]["roleType"]
          showOnProfile?: boolean
          title: string
        }
        Update: {
          canAuditBallots?: boolean | null
          canCreateCredentials?: boolean | null
          canEditAttendance?: boolean | null
          canExportStars?: boolean | null
          canManageRoles?: boolean | null
          canManageSuspensions?: boolean | null
          canManageVerification?: boolean | null
          canModerate?: boolean | null
          canTriggerSync?: boolean | null
          canViewAuditLog?: boolean | null
          canVoteAsOfficer?: boolean | null
          color?: string | null
          createdAt?: string
          description?: string
          discordRoleId?: string | null
          discordSyncedColor?: number | null
          discordSyncedName?: string | null
          id?: string
          isLeadership?: boolean
          rank?: number | null
          roleType?: Database["platform"]["Enums"]["roleType"]
          showOnProfile?: boolean
          title?: string
        }
        Relationships: []
      }
      sandboxCredentials: {
        Row: {
          disabledAt: string | null
          environmentId: string
          id: string
          issuedAt: string
          lastUsedAt: string | null
          revokedAt: string | null
          rotatedAt: string | null
          scope: Database["platform"]["Enums"]["proxyScope"]
          status: Database["platform"]["Enums"]["credentialStatus"]
          tokenHash: string
          userId: string
        }
        Insert: {
          disabledAt?: string | null
          environmentId: string
          id?: string
          issuedAt?: string
          lastUsedAt?: string | null
          revokedAt?: string | null
          rotatedAt?: string | null
          scope: Database["platform"]["Enums"]["proxyScope"]
          status?: Database["platform"]["Enums"]["credentialStatus"]
          tokenHash: string
          userId: string
        }
        Update: {
          disabledAt?: string | null
          environmentId?: string
          id?: string
          issuedAt?: string
          lastUsedAt?: string | null
          revokedAt?: string | null
          rotatedAt?: string | null
          scope?: Database["platform"]["Enums"]["proxyScope"]
          status?: Database["platform"]["Enums"]["credentialStatus"]
          tokenHash?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandboxCredentials_environmentId_fkey"
            columns: ["environmentId"]
            isOneToOne: false
            referencedRelation: "sandboxEnvironments"
            referencedColumns: ["id"]
          },
        ]
      }
      sandboxEnvironments: {
        Row: {
          apiUrl: string
          autoPauseEnabled: boolean
          createdAt: string
          id: string
          jwtSecretId: string
          kind: Database["platform"]["Enums"]["envKind"]
          lastSeenActiveAt: string | null
          name: string
          ownerUserId: string
          prewarmEnabled: boolean
          projectRef: string
          provisionedAt: string | null
          proxyHostname: string
          publishableKey: string
          revokedAt: string | null
          secretKeySecretId: string
          status: Database["platform"]["Enums"]["envStatus"]
        }
        Insert: {
          apiUrl: string
          autoPauseEnabled?: boolean
          createdAt?: string
          id?: string
          jwtSecretId: string
          kind?: Database["platform"]["Enums"]["envKind"]
          lastSeenActiveAt?: string | null
          name: string
          ownerUserId: string
          prewarmEnabled?: boolean
          projectRef: string
          provisionedAt?: string | null
          proxyHostname: string
          publishableKey: string
          revokedAt?: string | null
          secretKeySecretId: string
          status?: Database["platform"]["Enums"]["envStatus"]
        }
        Update: {
          apiUrl?: string
          autoPauseEnabled?: boolean
          createdAt?: string
          id?: string
          jwtSecretId?: string
          kind?: Database["platform"]["Enums"]["envKind"]
          lastSeenActiveAt?: string | null
          name?: string
          ownerUserId?: string
          prewarmEnabled?: boolean
          projectRef?: string
          provisionedAt?: string | null
          proxyHostname?: string
          publishableKey?: string
          revokedAt?: string | null
          secretKeySecretId?: string
          status?: Database["platform"]["Enums"]["envStatus"]
        }
        Relationships: []
      }
      supabaseConnections: {
        Row: {
          accessTokenSecretId: string
          connectedAt: string
          expiresAt: string
          orgSlug: string
          refreshTokenSecretId: string
          scopes: string[]
          userId: string
        }
        Insert: {
          accessTokenSecretId: string
          connectedAt?: string
          expiresAt: string
          orgSlug: string
          refreshTokenSecretId: string
          scopes: string[]
          userId: string
        }
        Update: {
          accessTokenSecretId?: string
          connectedAt?: string
          expiresAt?: string
          orgSlug?: string
          refreshTokenSecretId?: string
          scopes?: string[]
          userId?: string
        }
        Relationships: []
      }
      teamAwards: {
        Row: {
          awardedAt: string
          awardedBy: string | null
          category: string
          citation: string | null
          competitionId: string
          id: string
          mergedPrUrl: string | null
          teamId: string
        }
        Insert: {
          awardedAt?: string
          awardedBy?: string | null
          category: string
          citation?: string | null
          competitionId: string
          id?: string
          mergedPrUrl?: string | null
          teamId: string
        }
        Update: {
          awardedAt?: string
          awardedBy?: string | null
          category?: string
          citation?: string | null
          competitionId?: string
          id?: string
          mergedPrUrl?: string | null
          teamId?: string
        }
        Relationships: [
          {
            foreignKeyName: "teamAwards_teamId_competitionId_fkey"
            columns: ["teamId", "competitionId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "competitionId"]
          },
        ]
      }
      teamEnvironments: {
        Row: {
          attachedAt: string
          attachedBy: string
          environmentId: string
          ownerRole: Database["platform"]["Enums"]["teamRole"]
          ownerUserId: string
          teamId: string
        }
        Insert: {
          attachedAt?: string
          attachedBy: string
          environmentId: string
          ownerRole?: Database["platform"]["Enums"]["teamRole"]
          ownerUserId: string
          teamId: string
        }
        Update: {
          attachedAt?: string
          attachedBy?: string
          environmentId?: string
          ownerRole?: Database["platform"]["Enums"]["teamRole"]
          ownerUserId?: string
          teamId?: string
        }
        Relationships: [
          {
            foreignKeyName: "teamEnvironments_environmentId_ownerUserId_fkey"
            columns: ["environmentId", "ownerUserId"]
            isOneToOne: false
            referencedRelation: "sandboxEnvironments"
            referencedColumns: ["id", "ownerUserId"]
          },
          {
            foreignKeyName: "teamEnvironments_teamId_fkey"
            columns: ["teamId"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teamEnvironments_teamId_ownerUserId_ownerRole_fkey"
            columns: ["teamId", "ownerUserId", "ownerRole"]
            isOneToOne: false
            referencedRelation: "teamMembers"
            referencedColumns: ["teamId", "userId", "role"]
          },
        ]
      }
      teamMembers: {
        Row: {
          competitionId: string
          joinedAt: string
          role: Database["platform"]["Enums"]["teamRole"]
          teamId: string
          userId: string
        }
        Insert: {
          competitionId: string
          joinedAt?: string
          role?: Database["platform"]["Enums"]["teamRole"]
          teamId: string
          userId: string
        }
        Update: {
          competitionId?: string
          joinedAt?: string
          role?: Database["platform"]["Enums"]["teamRole"]
          teamId?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "teamMembers_teamId_competitionId_fkey"
            columns: ["teamId", "competitionId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "competitionId"]
          },
        ]
      }
      teamMembershipRequests: {
        Row: {
          competitionId: string
          createdAt: string
          createdBy: string
          direction: Database["platform"]["Enums"]["membershipDirection"]
          expiresAt: string | null
          id: string
          message: string | null
          notifiedAt: string | null
          respondedAt: string | null
          respondedBy: string | null
          status: Database["platform"]["Enums"]["membershipRequestStatus"]
          teamId: string
          userId: string
        }
        Insert: {
          competitionId: string
          createdAt?: string
          createdBy: string
          direction: Database["platform"]["Enums"]["membershipDirection"]
          expiresAt?: string | null
          id?: string
          message?: string | null
          notifiedAt?: string | null
          respondedAt?: string | null
          respondedBy?: string | null
          status?: Database["platform"]["Enums"]["membershipRequestStatus"]
          teamId: string
          userId: string
        }
        Update: {
          competitionId?: string
          createdAt?: string
          createdBy?: string
          direction?: Database["platform"]["Enums"]["membershipDirection"]
          expiresAt?: string | null
          id?: string
          message?: string | null
          notifiedAt?: string | null
          respondedAt?: string | null
          respondedBy?: string | null
          status?: Database["platform"]["Enums"]["membershipRequestStatus"]
          teamId?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "teamMembershipRequests_teamId_competitionId_fkey"
            columns: ["teamId", "competitionId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "competitionId"]
          },
        ]
      }
      teams: {
        Row: {
          acceptingRequests: boolean
          clonedFromTeamId: string | null
          competedAt: string | null
          competitionId: string
          createdBy: string
          id: string
          joinCode: string
          lockedManuallyAt: string | null
          name: string
          requirementsMet: number | null
          slug: string
          submissionState:
            | Database["platform"]["Enums"]["submissionState"]
            | null
          submissionUrl: string | null
          submittedAt: string | null
        }
        Insert: {
          acceptingRequests?: boolean
          clonedFromTeamId?: string | null
          competedAt?: string | null
          competitionId: string
          createdBy: string
          id?: string
          joinCode: string
          lockedManuallyAt?: string | null
          name: string
          requirementsMet?: number | null
          slug: string
          submissionState?:
            | Database["platform"]["Enums"]["submissionState"]
            | null
          submissionUrl?: string | null
          submittedAt?: string | null
        }
        Update: {
          acceptingRequests?: boolean
          clonedFromTeamId?: string | null
          competedAt?: string | null
          competitionId?: string
          createdBy?: string
          id?: string
          joinCode?: string
          lockedManuallyAt?: string | null
          name?: string
          requirementsMet?: number | null
          slug?: string
          submissionState?:
            | Database["platform"]["Enums"]["submissionState"]
            | null
          submissionUrl?: string | null
          submittedAt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_clonedFromTeamId_fkey"
            columns: ["clonedFromTeamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      tiebreakDisclosures: {
        Row: {
          competitionId: string
          higherTeamId: string
          lowerTeamId: string
        }
        Insert: {
          competitionId: string
          higherTeamId: string
          lowerTeamId: string
        }
        Update: {
          competitionId?: string
          higherTeamId?: string
          lowerTeamId?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiebreakDisclosures_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiebreakDisclosures_higherTeamId_fkey"
            columns: ["higherTeamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiebreakDisclosures_lowerTeamId_fkey"
            columns: ["lowerTeamId"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      userRoles: {
        Row: {
          roleId: string
          userId: string
        }
        Insert: {
          roleId: string
          userId: string
        }
        Update: {
          roleId?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "userRoles_roleId_roles_id_fkey"
            columns: ["roleId"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      userSuspensions: {
        Row: {
          id: string
          reason: string | null
          service: string
          suspendedAt: string
          suspendedBy: string | null
          userId: string
        }
        Insert: {
          id?: string
          reason?: string | null
          service: string
          suspendedAt?: string
          suspendedBy?: string | null
          userId: string
        }
        Update: {
          id?: string
          reason?: string | null
          service?: string
          suspendedAt?: string
          suspendedBy?: string | null
          userId?: string
        }
        Relationships: []
      }
      workshops: {
        Row: {
          airtableRecordId: string | null
          deletedAt: string | null
          id: string
          meetingId: string
          projectId: string
        }
        Insert: {
          airtableRecordId?: string | null
          deletedAt?: string | null
          id?: string
          meetingId: string
          projectId: string
        }
        Update: {
          airtableRecordId?: string | null
          deletedAt?: string | null
          id?: string
          meetingId?: string
          projectId?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshops_meetingId_fkey"
            columns: ["meetingId"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshops_projectId_fkey"
            columns: ["projectId"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      memberPoints: {
        Row: {
          competitionsScored: number | null
          lifetimePoints: number | null
          userId: string | null
        }
        Relationships: []
      }
      memberStars: {
        Row: {
          competitionStar: boolean | null
          meetingId: string | null
          projectId: string | null
          userId: string | null
          won: boolean | null
          workshopId: string | null
          workshopStar: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "workshops_meetingId_fkey"
            columns: ["meetingId"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshops_projectId_fkey"
            columns: ["projectId"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profileWithVerification: {
        Row: {
          hasDiscord: boolean | null
          hasGithub: boolean | null
          hasGraduationDate: boolean | null
          hasPronouns: boolean | null
          nameMatchesInvolvement: boolean | null
          userId: string | null
          verified: boolean | null
        }
        Insert: {
          hasDiscord?: never
          hasGithub?: never
          hasGraduationDate?: never
          hasPronouns?: never
          nameMatchesInvolvement?: never
          userId?: string | null
          verified?: never
        }
        Update: {
          hasDiscord?: never
          hasGithub?: never
          hasGraduationDate?: never
          hasPronouns?: never
          nameMatchesInvolvement?: never
          userId?: string | null
          verified?: never
        }
        Relationships: []
      }
      resolvedUserPermissions: {
        Row: {
          canAuditBallots: boolean | null
          canCreateCredentials: boolean | null
          canEditAttendance: boolean | null
          canExportStars: boolean | null
          canManageRoles: boolean | null
          canManageSuspensions: boolean | null
          canManageVerification: boolean | null
          canModerate: boolean | null
          canTriggerSync: boolean | null
          canViewAuditLog: boolean | null
          canVoteAsOfficer: boolean | null
          isLeader: boolean | null
          minRank: number | null
          userId: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_content_action: {
        Args: {
          action: Database["platform"]["Enums"]["contentAction"]
          app_slug: string
          content_ref: string
          content_type: string
          resolution_id: string
        }
        Returns: undefined
      }
      conformance_check: {
        Args: { app_slug: string }
        Returns: {
          checks: Json
          contentType: string
          tableName: string
        }[]
      }
      conformance_report: { Args: { app_slug: string }; Returns: Json }
      content_types: {
        Args: never
        Returns: {
          appId: string
          appSlug: string
          authorColumn: string
          contentType: string
          label: string
          quarantineColumn: string
          refColumn: string
          schemaName: string
          snapshotColumns: string[]
          tableName: string
          urlTemplate: string
          visibility: Database["platform"]["Enums"]["contentVisibility"]
        }[]
      }
      dismiss_report: {
        Args: { moderator_note?: string; report_id: string }
        Returns: {
          dismissed: boolean
        }[]
      }
      dismiss_report_as: {
        Args: { actor: string; moderator_note?: string; report_id: string }
        Returns: Json
      }
      file_report: {
        Args: {
          app_slug: string
          content_ref: string
          content_type: string
          description?: string
          reason: Database["platform"]["Enums"]["reportReason"]
        }
        Returns: {
          corroborated: boolean
          reportId: string
        }[]
      }
      has_permission: { Args: { perm: string; uid: string }; Returns: boolean }
      inspect_content: {
        Args: { app_slug: string; content_ref: string; content_type: string }
        Returns: Json
      }
      is_suspended: { Args: { uid: string }; Returns: boolean }
      is_test_identity: { Args: { uid: string }; Returns: boolean }
      list_content_types: {
        Args: { app_slug?: string }
        Returns: {
          appId: string
          appSlug: string
          authorColumn: string
          contentType: string
          label: string
          quarantineColumn: string
          refColumn: string
          schemaName: string
          snapshotColumns: string[]
          tableName: string
          urlTemplate: string
          visibility: Database["platform"]["Enums"]["contentVisibility"]
        }[]
      }
      list_report_reasons: {
        Args: never
        Returns: {
          description: string
          reason: Database["platform"]["Enums"]["reportReason"]
          title: string
        }[]
      }
      log_proxy_request: {
        Args: {
          credential_id: string
          method: string
          path: string
          status: number
        }
        Returns: undefined
      }
      my_reports: {
        Args: { app_slug?: string; only_open?: boolean; since?: string }
        Returns: {
          appSlug: string
          contentRef: string
          contentRemoved: boolean
          contentType: string
          contentUrl: string
          createdAt: string
          description: string
          outcome: string
          reason: Database["platform"]["Enums"]["reportReason"]
          reportId: string
          resolvedAt: string
          snapshot: string
          status: Database["platform"]["Enums"]["reportStatus"]
        }[]
      }
      resolve_content: {
        Args: { app_slug: string; content_ref: string; content_type: string }
        Returns: Json
      }
      resolve_report: {
        Args: {
          apply_globally?: boolean
          content_action: Database["platform"]["Enums"]["contentAction"]
          filer_action: Database["platform"]["Enums"]["filerAction"]
          moderator_note?: string
          report_id: string
          subject_action: Database["platform"]["Enums"]["subjectAction"]
        }
        Returns: {
          bannedUserId: string
          resolutionId: string
        }[]
      }
      resolve_report_as: {
        Args: {
          actor: string
          apply_globally?: boolean
          content_action: Database["platform"]["Enums"]["contentAction"]
          filer_action: Database["platform"]["Enums"]["filerAction"]
          moderator_note?: string
          report_id: string
          subject_action: Database["platform"]["Enums"]["subjectAction"]
        }
        Returns: Json
      }
      resolve_sandbox_credential: {
        Args: { hostname: string; token_hash: string }
        Returns: {
          credential_id: string
          environment_id: string
          environment_name: string
          outcome: string
          project_ref: string
          publishable_key: string
          scope: Database["platform"]["Enums"]["proxyScope"]
          secret_key: string
          upstream_url: string
          user_id: string
        }[]
      }
    }
    Enums: {
      checkInMethod: "discord" | "officer" | "airtable"
      contentAction: "quarantine" | "no_action"
      contentVisibility: "public" | "restricted"
      credentialStatus: "active" | "disabled" | "revoked"
      credentialType: "email_password" | "totp" | "email_password_totp"
      electionElectorate: "teams" | "officers"
      electionPurpose: "points" | "tiebreak"
      electionStatus: "draft" | "open" | "closed" | "tallied"
      envKind: "owned" | "branch"
      envStatus:
        | "provisioning"
        | "active"
        | "paused"
        | "restoring"
        | "detached"
        | "revoked"
        | "orphaned"
      envVarVisibility: "shared" | "secret"
      filerAction: "warn" | "suspend" | "no_action"
      graduationSemester: "spring" | "summer" | "fall"
      membershipDirection: "invite" | "request"
      membershipRequestStatus:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      oauthRegistrationType: "development" | "production"
      proxyScope: "publishable" | "secret"
      quarantineEffect: "hide" | "freeze"
      reportReason:
        | "harassment"
        | "hate_speech"
        | "spam"
        | "sexual_content"
        | "violence"
        | "impersonation"
        | "off_topic"
        | "other"
      reportStatus: "open" | "resolved" | "dismissed"
      roleType: "default" | "root" | "custom"
      subjectAction: "warn" | "suspend" | "ban" | "no_action"
      submissionState: "open" | "closed" | "merged"
      teamRole: "lead" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  schedule_builder: {
    Tables: {
      buildings: {
        Row: {
          address: string | null
          description: string
          id: number
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          address?: string | null
          description: string
          id: number
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          address?: string | null
          description?: string
          id?: number
          latitude?: number | null
          longitude?: number | null
        }
        Relationships: []
      }
      campuses: {
        Row: {
          abbr: string
          description: string
          id: number
        }
        Insert: {
          abbr: string
          description: string
          id?: number
        }
        Update: {
          abbr?: string
          description?: string
          id?: number
        }
        Relationships: []
      }
      colleges: {
        Row: {
          description: string
          id: number
        }
        Insert: {
          description: string
          id?: number
        }
        Update: {
          description?: string
          id?: number
        }
        Relationships: []
      }
      courseDetails: {
        Row: {
          corequisite: string | null
          courseId: number
          description: string | null
          equivalentCourses: string | null
          gradingSystem: string | null
          id: number
          lastFetched: string
          prerequisites: Json | null
          semesterOffered: string | null
        }
        Insert: {
          corequisite?: string | null
          courseId: number
          description?: string | null
          equivalentCourses?: string | null
          gradingSystem?: string | null
          id?: number
          lastFetched: string
          prerequisites?: Json | null
          semesterOffered?: string | null
        }
        Update: {
          corequisite?: string | null
          courseId?: number
          description?: string | null
          equivalentCourses?: string | null
          gradingSystem?: string | null
          id?: number
          lastFetched?: string
          prerequisites?: Json | null
          semesterOffered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courseDetails_courseId_courses_id_fkey"
            columns: ["courseId"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courseDetails_courseId_courses_id_fkey"
            columns: ["courseId"]
            isOneToOne: false
            referencedRelation: "offeringSearch"
            referencedColumns: ["courseId"]
          },
        ]
      }
      courses: {
        Row: {
          abbr: string
          abbrTitle: string
          collegeId: number
          courseNumber: string
          departmentId: number | null
          honors: boolean
          id: number
          maxCreditHours: number
          minBillingCreditHours: number
          minCreditHours: number
          subjectId: number
          title: string
        }
        Insert: {
          abbr: string
          abbrTitle: string
          collegeId: number
          courseNumber: string
          departmentId?: number | null
          honors?: boolean
          id?: number
          maxCreditHours: number
          minBillingCreditHours: number
          minCreditHours: number
          subjectId: number
          title: string
        }
        Update: {
          abbr?: string
          abbrTitle?: string
          collegeId?: number
          courseNumber?: string
          departmentId?: number | null
          honors?: boolean
          id?: number
          maxCreditHours?: number
          minBillingCreditHours?: number
          minCreditHours?: number
          subjectId?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_collegeId_colleges_id_fkey"
            columns: ["collegeId"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_departmentId_departments_id_fkey"
            columns: ["departmentId"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_subjectId_subjects_id_fkey"
            columns: ["subjectId"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          collegeId: number
          description: string
          id: number
        }
        Insert: {
          collegeId: number
          description: string
          id?: number
        }
        Update: {
          collegeId?: number
          description?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "departments_collegeId_colleges_id_fkey"
            columns: ["collegeId"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          averageRating: number
          difficultyRating: number
          firstName: string
          id: number
          lastName: string
          totalReviews: number
          wouldTakeAgainRating: number
        }
        Insert: {
          averageRating?: number
          difficultyRating?: number
          firstName: string
          id?: number
          lastName: string
          totalReviews?: number
          wouldTakeAgainRating?: number
        }
        Update: {
          averageRating?: number
          difficultyRating?: number
          firstName?: string
          id?: number
          lastName?: string
          totalReviews?: number
          wouldTakeAgainRating?: number
        }
        Relationships: []
      }
      meetings: {
        Row: {
          buildingId: number | null
          endDate: string | null
          endTime: string | null
          friday: boolean
          id: number
          locationStatus: Database["schedule_builder"]["Enums"]["locationStatus"]
          monday: boolean
          offeringCrn: number
          room: string | null
          saturday: boolean
          startDate: string | null
          startTime: string | null
          sunday: boolean
          thursday: boolean
          tuesday: boolean
          wednesday: boolean
        }
        Insert: {
          buildingId?: number | null
          endDate?: string | null
          endTime?: string | null
          friday?: boolean
          id?: number
          locationStatus?: Database["schedule_builder"]["Enums"]["locationStatus"]
          monday?: boolean
          offeringCrn: number
          room?: string | null
          saturday?: boolean
          startDate?: string | null
          startTime?: string | null
          sunday?: boolean
          thursday?: boolean
          tuesday?: boolean
          wednesday?: boolean
        }
        Update: {
          buildingId?: number | null
          endDate?: string | null
          endTime?: string | null
          friday?: boolean
          id?: number
          locationStatus?: Database["schedule_builder"]["Enums"]["locationStatus"]
          monday?: boolean
          offeringCrn?: number
          room?: string | null
          saturday?: boolean
          startDate?: string | null
          startTime?: string | null
          sunday?: boolean
          thursday?: boolean
          tuesday?: boolean
          wednesday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meetings_buildingId_buildings_id_fkey"
            columns: ["buildingId"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_offeringCrn_offerings_crn_fkey"
            columns: ["offeringCrn"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["crn"]
          },
          {
            foreignKeyName: "meetings_offeringCrn_offerings_crn_fkey"
            columns: ["offeringCrn"]
            isOneToOne: false
            referencedRelation: "offeringSearch"
            referencedColumns: ["crn"]
          },
        ]
      }
      offerings: {
        Row: {
          academicPeriod: number
          active: boolean
          actualEnrollment: number
          campusId: number
          courseId: number
          crn: number
          crossListingId: string | null
          instructorId: number | null
          maximumEnrollment: number
          minimumEnrollment: number
          partOfTerm: string
          scheduleTypeId: number
          seatsAvailable: number
        }
        Insert: {
          academicPeriod: number
          active: boolean
          actualEnrollment: number
          campusId: number
          courseId: number
          crn: number
          crossListingId?: string | null
          instructorId?: number | null
          maximumEnrollment: number
          minimumEnrollment?: number
          partOfTerm: string
          scheduleTypeId: number
          seatsAvailable: number
        }
        Update: {
          academicPeriod?: number
          active?: boolean
          actualEnrollment?: number
          campusId?: number
          courseId?: number
          crn?: number
          crossListingId?: string | null
          instructorId?: number | null
          maximumEnrollment?: number
          minimumEnrollment?: number
          partOfTerm?: string
          scheduleTypeId?: number
          seatsAvailable?: number
        }
        Relationships: [
          {
            foreignKeyName: "offerings_academicPeriod_terms_academicPeriod_fkey"
            columns: ["academicPeriod"]
            isOneToOne: false
            referencedRelation: "availableTerms"
            referencedColumns: ["academicPeriod"]
          },
          {
            foreignKeyName: "offerings_academicPeriod_terms_academicPeriod_fkey"
            columns: ["academicPeriod"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["academicPeriod"]
          },
          {
            foreignKeyName: "offerings_campusId_campuses_id_fkey"
            columns: ["campusId"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_courseId_courses_id_fkey"
            columns: ["courseId"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_courseId_courses_id_fkey"
            columns: ["courseId"]
            isOneToOne: false
            referencedRelation: "offeringSearch"
            referencedColumns: ["courseId"]
          },
          {
            foreignKeyName: "offerings_instructorId_instructors_id_fkey"
            columns: ["instructorId"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_instructorId_instructors_id_fkey"
            columns: ["instructorId"]
            isOneToOne: false
            referencedRelation: "offeringSearch"
            referencedColumns: ["instructorId"]
          },
          {
            foreignKeyName: "offerings_scheduleTypeId_scheduleTypes_id_fkey"
            columns: ["scheduleTypeId"]
            isOneToOne: false
            referencedRelation: "scheduleTypes"
            referencedColumns: ["id"]
          },
        ]
      }
      partsOfTerm: {
        Row: {
          academicPeriod: number
          censusDate: string
          classesBegin: string
          classesEnd: string
          code: string
          description: string
          dropAddEnds: string
          finalsEnd: string | null
          withdrawalDeadline: string
        }
        Insert: {
          academicPeriod: number
          censusDate: string
          classesBegin: string
          classesEnd: string
          code: string
          description: string
          dropAddEnds: string
          finalsEnd?: string | null
          withdrawalDeadline: string
        }
        Update: {
          academicPeriod?: number
          censusDate?: string
          classesBegin?: string
          classesEnd?: string
          code?: string
          description?: string
          dropAddEnds?: string
          finalsEnd?: string | null
          withdrawalDeadline?: string
        }
        Relationships: [
          {
            foreignKeyName: "partsOfTerm_academicPeriod_terms_academicPeriod_fkey"
            columns: ["academicPeriod"]
            isOneToOne: false
            referencedRelation: "availableTerms"
            referencedColumns: ["academicPeriod"]
          },
          {
            foreignKeyName: "partsOfTerm_academicPeriod_terms_academicPeriod_fkey"
            columns: ["academicPeriod"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["academicPeriod"]
          },
        ]
      }
      scheduleTypes: {
        Row: {
          abbr: string
          description: string
          id: number
        }
        Insert: {
          abbr: string
          description: string
          id?: number
        }
        Update: {
          abbr?: string
          description?: string
          id?: number
        }
        Relationships: []
      }
      subjects: {
        Row: {
          abbr: string
          description: string
          id: number
        }
        Insert: {
          abbr: string
          description: string
          id?: number
        }
        Update: {
          abbr?: string
          description?: string
          id?: number
        }
        Relationships: []
      }
      terms: {
        Row: {
          academicPeriod: number
          description: string
        }
        Insert: {
          academicPeriod: number
          description: string
        }
        Update: {
          academicPeriod?: number
          description?: string
        }
        Relationships: []
      }
      userPlanDraftCourses: {
        Row: {
          academicPeriod: number
          courseId: number
          excludedCrns: number[]
          id: string
          userId: string
        }
        Insert: {
          academicPeriod: number
          courseId: number
          excludedCrns?: number[]
          id?: string
          userId: string
        }
        Update: {
          academicPeriod?: number
          courseId?: number
          excludedCrns?: number[]
          id?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "userPlanDraftCourses_courseId_courses_id_fkey"
            columns: ["courseId"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "userPlanDraftCourses_courseId_courses_id_fkey"
            columns: ["courseId"]
            isOneToOne: false
            referencedRelation: "offeringSearch"
            referencedColumns: ["courseId"]
          },
        ]
      }
      userPlanDrafts: {
        Row: {
          academicPeriod: number
          gapDay: string | null
          inputCampus: string | null
          maxCreditHours: number
          minCreditHours: number
          prefEndTime: string | null
          prefStartTime: string | null
          showFilledClasses: boolean
          userId: string
          walking: boolean
        }
        Insert: {
          academicPeriod: number
          gapDay?: string | null
          inputCampus?: string | null
          maxCreditHours?: number
          minCreditHours?: number
          prefEndTime?: string | null
          prefStartTime?: string | null
          showFilledClasses?: boolean
          userId: string
          walking?: boolean
        }
        Update: {
          academicPeriod?: number
          gapDay?: string | null
          inputCampus?: string | null
          maxCreditHours?: number
          minCreditHours?: number
          prefEndTime?: string | null
          prefStartTime?: string | null
          showFilledClasses?: boolean
          userId?: string
          walking?: boolean
        }
        Relationships: []
      }
      userPreferences: {
        Row: {
          currentAcademicPeriod: number | null
          userId: string
        }
        Insert: {
          currentAcademicPeriod?: number | null
          userId: string
        }
        Update: {
          currentAcademicPeriod?: number | null
          userId?: string
        }
        Relationships: []
      }
      userSavedPlans: {
        Row: {
          academicPeriod: number
          createdAt: string
          crns: number[]
          id: string
          pinned: boolean
          title: string
          updatedAt: string
          userId: string
        }
        Insert: {
          academicPeriod: number
          createdAt?: string
          crns: number[]
          id?: string
          pinned?: boolean
          title: string
          updatedAt?: string
          userId: string
        }
        Update: {
          academicPeriod?: number
          createdAt?: string
          crns?: number[]
          id?: string
          pinned?: boolean
          title?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: []
      }
    }
    Views: {
      availableTerms: {
        Row: {
          academicPeriod: number | null
          description: string | null
        }
        Relationships: []
      }
      offeringSearch: {
        Row: {
          abbr: string | null
          academicPeriod: number | null
          active: boolean | null
          courseId: number | null
          courseNumber: string | null
          crn: number | null
          firstName: string | null
          instructorId: number | null
          lastName: string | null
          maxCreditHours: number | null
          search_vector: unknown
          seatsAvailable: number | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offerings_academicPeriod_terms_academicPeriod_fkey"
            columns: ["academicPeriod"]
            isOneToOne: false
            referencedRelation: "availableTerms"
            referencedColumns: ["academicPeriod"]
          },
          {
            foreignKeyName: "offerings_academicPeriod_terms_academicPeriod_fkey"
            columns: ["academicPeriod"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["academicPeriod"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      locationStatus: "TBA" | "NCRR" | "RESERVED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  study_group_finder: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  platform: {
    Enums: {
      checkInMethod: ["discord", "officer", "airtable"],
      contentAction: ["quarantine", "no_action"],
      contentVisibility: ["public", "restricted"],
      credentialStatus: ["active", "disabled", "revoked"],
      credentialType: ["email_password", "totp", "email_password_totp"],
      electionElectorate: ["teams", "officers"],
      electionPurpose: ["points", "tiebreak"],
      electionStatus: ["draft", "open", "closed", "tallied"],
      envKind: ["owned", "branch"],
      envStatus: [
        "provisioning",
        "active",
        "paused",
        "restoring",
        "detached",
        "revoked",
        "orphaned",
      ],
      envVarVisibility: ["shared", "secret"],
      filerAction: ["warn", "suspend", "no_action"],
      graduationSemester: ["spring", "summer", "fall"],
      membershipDirection: ["invite", "request"],
      membershipRequestStatus: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
      oauthRegistrationType: ["development", "production"],
      proxyScope: ["publishable", "secret"],
      quarantineEffect: ["hide", "freeze"],
      reportReason: [
        "harassment",
        "hate_speech",
        "spam",
        "sexual_content",
        "violence",
        "impersonation",
        "off_topic",
        "other",
      ],
      reportStatus: ["open", "resolved", "dismissed"],
      roleType: ["default", "root", "custom"],
      subjectAction: ["warn", "suspend", "ban", "no_action"],
      submissionState: ["open", "closed", "merged"],
      teamRole: ["lead", "member"],
    },
  },
  public: {
    Enums: {},
  },
  schedule_builder: {
    Enums: {
      locationStatus: ["TBA", "NCRR", "RESERVED"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
  study_group_finder: {
    Enums: {},
  },
} as const

