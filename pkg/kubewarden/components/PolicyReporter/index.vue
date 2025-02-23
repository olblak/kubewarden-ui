<script>
import { mapGetters } from 'vuex';
import isEmpty from 'lodash/isEmpty';
import semver from 'semver';

import { SERVICE, WORKLOAD_TYPES } from '@shell/config/types';
import { KUBERNETES } from '@shell/config/labels-annotations';
import ResourceFetch from '@shell/mixins/resource-fetch';
import ResourceManager from '@shell/mixins/resource-manager';

import Loading from '@shell/components/Loading';
import { Banner } from '@components/Banner';

import { handleGrowl } from '../../utils/handle-growl';
import { rootKubewardenRoute } from '../../utils/custom-routing';
import { KUBEWARDEN, KUBEWARDEN_APPS, KUBEWARDEN_CHARTS } from '../../types';

export default {
  components: { Banner, Loading },

  mixins: [ResourceFetch, ResourceManager],

  async fetch() {
    await this.$fetchType(WORKLOAD_TYPES.DEPLOYMENT);
    await this.$fetchType(SERVICE);

    this.secondaryResourceData = this.secondaryResourceDataConfig();
    await this.resourceManagerFetchSecondaryResources(this.secondaryResourceData);
  },

  data() {
    return {
      rootKubewardenRoute,
      controller:               null,
      reporterReportingService: null,
      reporterUIService:        null,
      reporterUrl:              null,
      secondaryResourceData:    this.secondaryResourceDataConfig(),
    };
  },

  watch: {
    reporterUIService() {
      this.reporterUrl = this.policyReporterProxy();
    }
  },

  computed: {
    ...mapGetters(['currentCluster']),

    allDeployments() {
      return this.$store.getters['cluster/all'](WORKLOAD_TYPES.DEPLOYMENT);
    },

    controllerDeployments() {
      return this.allDeployments?.filter(deploy => deploy?.metadata?.labels?.[KUBERNETES.INSTANCE] === KUBEWARDEN_APPS.RANCHER_CONTROLLER);
    },

    hasPolicyServerSchema() {
      return this.$store.getters['cluster/schemaFor'](KUBEWARDEN.POLICY_SERVER);
    },

    hasClusterPolicyReportSchema() {
      return this.$store.getters['cluster/schemaFor'](KUBEWARDEN.CLUSTER_POLICY_REPORT);
    },

    hasPolicyReportSchema() {
      return this.$store.getters['cluster/schemaFor'](KUBEWARDEN.POLICY_REPORT);
    },

    reporterCrds() {
      return this.hasClusterPolicyReportSchema && this.hasPolicyReportSchema;
    },

    reporterDeployment() {
      return this.controllerDeployments?.find(deploy => deploy?.metadata?.labels?.['app.kubernetes.io/component'] === 'ui');
    },

    reporterDeploymentState() {
      return this.reporterDeployment?.metadata?.state?.name;
    },

    controllerNamespace() {
      if ( !isEmpty(this.controller) ) {
        return this.controller?.metadata?.namespace;
      }

      return null;
    },

    controllerVersion() {
      if ( !isEmpty(this.controller) ) {
        return this.controller?.metadata?.labels?.['app.kubernetes.io/version'];
      }

      return null;
    },

    canShowReporter() {
      if ( !this.controllerVersion ) {
        return false;
      }

      return semver.satisfies(this.controllerVersion, '>=1.7.0 || >=1.7.0-rc*', { includePrerelease: true });
    }
  },

  methods: {
    secondaryResourceDataConfig() {
      return {
        namespace: this.controller?.metadata?.namespace,
        data:      {
          [WORKLOAD_TYPES.DEPLOYMENT]: {
            applyTo: [
              {
                var:         'controller',
                parsingFunc: (data) => {
                  return data.find(deploy => deploy?.metadata?.labels?.[KUBERNETES.MANAGED_NAME] === KUBEWARDEN_CHARTS.CONTROLLER);
                }
              }
            ]
          },
          [SERVICE]: {
            applyTo: [{ var: 'services' },
              {
                var:         'reporterReportingService',
                parsingFunc: (data) => {
                  return data.find(service => service?.metadata?.labels?.['app.kubernetes.io/component'] === 'reporting');
                }
              },
              {
                var:         'reporterUIService',
                parsingFunc: (data) => {
                  return data.find(service => service?.metadata?.labels?.['app.kubernetes.io/name'] === 'ui');
                }
              }
            ]
          }
        }
      };
    },

    policyReporterProxy() {
      try {
        const service = this.reporterUIService;

        if ( service ) {
          const base = `/k8s/clusters/${ this.currentCluster.id }/api/v1/namespaces/${ service.metadata?.namespace }/services/`;
          const proxy = `http:${ service.metadata?.name }:${ service.spec?.ports?.[0].port }/proxy`;

          return base + proxy;
        }
      } catch (e) {
        handleGrowl({ error: e, store: this.$store });
      }
    }
  }
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <div v-else>
    <template v-if="!hasPolicyServerSchema">
      <div>
        <h1 class="mb-20">
          {{ t('kubewarden.policyReporter.title') }}
        </h1>
        <Banner
          :label="t('kubewarden.policyReporter.noSchema.banner')"
          color="error"
          class="mt-20 mb-20"
          data-testid="kw-pr-noschema-banner"
        />
        <div class="install-route">
          <n-link :to="rootKubewardenRoute()">
            <button class="btn role-primary mt-20">
              {{ t('kubewarden.policyReporter.noSchema.link') }}
            </button>
          </n-link>
        </div>
      </div>
    </template>
    <template v-else-if="!canShowReporter">
      <Banner
        color="error"
        class="mt-20 mb-20"
        data-testid="kw-pr-incompatibile-banner"
      >
        <p>{{ t('kubewarden.policyReporter.incompatible.banner') }}</p>
        <p v-if="controllerVersion" class="mt-10" data-testid="kw-pr-controller-version-badge">
          {{ t('kubewarden.policyReporter.incompatible.current') }}: <span class="version-badge">{{ controllerVersion }}</span>
        </p>
      </Banner>
    </template>
    <template v-else-if="canShowReporter">
      <template v-if="!reporterCrds">
        <Banner
          :label="t('kubewarden.policyReporter.incompatible.noCrds.banner')"
          data-testid="kw-pr-no-crds-banner"
          color="error"
        />
      </template>
      <template v-else>
        <template v-if="!reporterReportingService">
          <Banner
            :label="t('kubewarden.policyReporter.service.main.banner.unavailable')"
            data-testid="kw-pr-main-service-unavailable-banner"
            color="warning"
          />
        </template>
        <template v-else-if="!reporterUIService">
          <Banner
            :label="t('kubewarden.policyReporter.service.ui.banner.unavailable')"
            data-testid="kw-pr-ui-service-unavailable-banner"
            color="warning"
          />
        </template>
        <template v-if="reporterUrl">
          <div>
            <div class="reporter__header mb-20">
              <div
                class="reporter__external-link"
              >
                <a
                  :href="reporterUrl"
                  target="_blank"
                  rel="noopener nofollow"
                  data-testid="kw-pr-reporter-link"
                >
                  {{ t('kubewarden.policyReporter.link') }} <i class="icon icon-external-link" />
                </a>
              </div>
            </div>
            <template v-if="reporterDeploymentState && reporterDeploymentState !== 'active'">
              <Banner
                :label="t('kubewarden.policyReporter.deployment.banner.unavailable', { state: reporterDeploymentState })"
                color="warning"
              />
            </template>
            <template v-else>
              <div class="reporter__container">
                <iframe
                  ref="frame"
                  :src="reporterUrl"
                  frameborder="0"
                  data-testid="kw-pr-iframe"
                />
              </div>
            </template>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style lang='scss' scoped>
.version-badge {
  background: var(--primary);
  color: var(--primary-text);
  border-radius: var(--border-radius);
  padding: 4px 8px;
}

.install-route {
  display: flex;
  justify-content: center;
  align-items: center;
}

.reporter {
  &__header {
    display: flex;
    justify-content: right;
    align-items: center;
  }

  &__container {
    iframe {
      width: 100%;
      height: 80vh;
    }
  }
}
</style>
