---
name: docker
description: This skill should be used when the user asks to "docker,container,컨테이너,dockerfile,도커,docker-compose". Containerization with Docker, Dockerfile optimization, and compose configuration
triggers:
  - "docker"
  - "container"
  - "컨테이너"
  - "dockerfile"
  - "도커"
  - "docker-compose"
---
<!-- tenetx-managed -->

<Purpose>
Docker를 활용한 컨테이너화를 체계적으로 수행합니다.
의존성 분석, Dockerfile 작성, 레이어 최적화,
Docker Compose 구성, 헬스 체크까지 컨테이너 라이프사이클 전체를 다룹니다.
</Purpose>

<Steps>
1. **의존성 분석**: 애플리케이션의 런타임 요구사항을 파악합니다
   - 런타임 환경 (Node.js, Python, Go 등)
   - 시스템 의존성 (네이티브 바이너리, 라이브러리)
   - 환경 변수 목록 및 기본값
   - 포트 매핑 (애플리케이션 포트, 디버그 포트)
   - 볼륨 마운트 필요 사항 (데이터 영속성, 설정 파일)
   - 외부 서비스 의존성 (DB, Redis, 메시지 큐)

2. **Dockerfile 작성**: 최적화된 Dockerfile을 구성합니다
   - 베이스 이미지 선택 (alpine vs slim vs distroless)
   - 멀티스테이지 빌드 적용 (빌드 스테이지 / 런타임 스테이지)
   - 레이어 캐싱 최적화 (변경 빈도 낮은 것부터 순서)
     * 시스템 의존성 설치
     * package.json / lockfile 복사 + npm install
     * 소스 코드 복사 + 빌드
   - .dockerignore 설정 (node_modules, .git, 테스트 파일)
   - 비루트 사용자 설정 (보안)
   - 시그널 핸들링 (SIGTERM graceful shutdown)
   - HEALTHCHECK 명령 설정

3. **이미지 최적화**: 이미지 크기와 보안을 개선합니다
   - 레이어 수 최소화 (RUN 명령 결합)
   - 불필요한 파일 제거 (빌드 도구, 캐시, 문서)
   - 프로덕션 의존성만 설치 (--omit=dev)
   - 이미지 크기 측정 및 목표 설정
   - 보안 스캔 (Trivy, Docker Scout)
   - 이미지 태깅 전략 (semver, git SHA, latest)

4. **Docker Compose 구성**: 멀티 컨테이너 환경을 정의합니다
   - 서비스 정의 (app, db, cache, proxy)
   - 네트워크 구성 (서비스 간 통신)
   - 볼륨 정의 (데이터 영속성)
   - 환경 변수 관리 (.env 파일, 인라인)
   - 의존성 순서 (depends_on + healthcheck)
   - 개발/프로덕션 오버라이드 분리
   - 리소스 제한 설정 (CPU, 메모리)

5. **헬스 체크 및 모니터링**: 컨테이너 상태를 관리합니다
   - HEALTHCHECK 엔드포인트 구현 (/health, /ready)
   - Liveness probe vs Readiness probe 구분
   - 로그 수집 구성 (stdout/stderr → 로그 시스템)
   - 메트릭 노출 (Prometheus 엔드포인트)
   - Graceful shutdown 구현 (SIGTERM 처리)
   - 재시작 정책 설정 (restart: unless-stopped)
</Steps>

## 에이전트 위임

`executor` 에이전트(Sonnet 모델)에 위임하여 Docker 구성을 구현합니다:

```
Agent(
  subagent_type="executor",
  model="sonnet",
  prompt="DOCKER TASK

Docker 컨테이너화를 구현하세요.

Application: [애플리케이션 설명]
Runtime: [Node.js / Python / Go / etc.]
Services: [필요한 외부 서비스 목록]

Docker Checklist:
1. Dockerfile 작성 (멀티스테이지, 최적화)
2. .dockerignore 설정
3. Docker Compose 구성 (개발/프로덕션)
4. 헬스 체크 설정
5. 보안 설정 (비루트 사용자, 이미지 스캔)
6. 볼륨 및 네트워크 구성

Output: Docker 구성 파일 및 문서:
- Dockerfile
- .dockerignore
- docker-compose.yml (dev/prod)
- 이미지 크기 리포트
- 실행 명령 가이드"
)
```

## External Consultation (Optional)

executor 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 Docker 구성을 먼저 완료** -- 독립적으로 구현
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 구성 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 복잡한 멀티스테이지 빌드
- 프로덕션 수준의 보안 강화
- 오케스트레이션 (Kubernetes 연동)
- 네이티브 의존성이 있는 이미지 최적화

### 자문을 생략하는 경우
- 단순 Node.js/Python 컨테이너화
- 개발 환경용 Docker Compose
- 잘 알려진 이미지 패턴
- 기존 Dockerfile의 경미한 수정

## Docker 체크리스트

### Dockerfile (6개)
- [ ] 멀티스테이지 빌드 적용
- [ ] 베이스 이미지에 고정 태그 사용 (latest 금지)
- [ ] 비루트 사용자로 실행
- [ ] .dockerignore가 적절히 설정됨
- [ ] 레이어 캐싱이 최적화됨
- [ ] HEALTHCHECK가 설정됨

### 보안 (4개)
- [ ] 이미지 취약점 스캔 완료
- [ ] 최소 권한 원칙 적용 (비루트, 읽기 전용 파일시스템)
- [ ] 시크릿이 이미지에 포함되지 않음
- [ ] 불필요한 도구/패키지가 제거됨

### 운영 (4개)
- [ ] Graceful shutdown이 구현됨 (SIGTERM)
- [ ] 로그가 stdout/stderr로 출력됨
- [ ] 리소스 제한이 설정됨
- [ ] 재시작 정책이 설정됨

### Compose (4개)
- [ ] 서비스 간 의존성이 healthcheck 기반으로 설정됨
- [ ] 개발/프로덕션 오버라이드가 분리됨
- [ ] 볼륨이 데이터 영속성에 적절히 사용됨
- [ ] 네트워크가 서비스별로 격리됨

## 이미지 크기 기준

| 런타임 | 목표 크기 | 베이스 이미지 |
|--------|-----------|--------------|
| Node.js | < 150MB | node:20-alpine |
| Python | < 200MB | python:3.12-slim |
| Go | < 30MB | gcr.io/distroless/static |
| Rust | < 30MB | debian:bookworm-slim (빌드) + scratch (런타임) |

<Output>
```
DOCKER CONFIGURATION / Docker 구성 문서
=========================================

Application: [애플리케이션명]
Runtime: [Node.js 20]
Image Size: [최종 이미지 크기]

DOCKERFILE / Dockerfile
-------------------------
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]

DOCKER COMPOSE / docker-compose.yml
--------------------------------------
services:
  app:
    build: .
    ports: ["3000:3000"]
    depends_on:
      db: { condition: service_healthy }
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/app
  db:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]

IMAGE ANALYSIS / 이미지 분석
------------------------------
Total Size: 142MB
Layers: 8
Base Image: node:20-alpine (45MB)
Dependencies: 85MB
Application: 12MB

SECURITY SCAN / 보안 스캔
---------------------------
Vulnerabilities: 0 CRITICAL, 0 HIGH, 2 MEDIUM
Recommendation: [조치 사항]
```
</Output>

<Policy>
- 베이스 이미지에 항상 고정 태그를 사용합니다 (latest 금지)
- 프로덕션 이미지에서 반드시 비루트 사용자로 실행합니다
- 시크릿은 절대 이미지에 포함하지 않습니다 (빌드 시에도)
- 이미지 크기를 정기적으로 모니터링합니다
- 보안 스캔을 CI/CD에 통합하여 취약한 이미지 배포를 차단합니다
- Graceful shutdown을 반드시 구현하여 데이터 손실을 방지합니다
</Policy>

## 다른 스킬과의 연동

**CI/CD 연동:**
```
/tenetx:ci-cd Docker 이미지 빌드 및 푸시 파이프라인
```
CI에서 Docker 이미지 자동 빌드/배포

**보안 리뷰 연동:**
```
/tenetx:security-review Dockerfile 및 이미지
```
Docker 구성의 보안 취약점 점검

**성능 연동:**
```
/tenetx:performance 컨테이너 리소스 사용량 분석
```
컨테이너의 리소스 최적화

## Best Practices

- **작은 이미지** -- 불필요한 것을 빼서 크기를 줄임
- **멀티스테이지** -- 빌드 도구를 런타임에 포함하지 않음
- **캐시 활용** -- 레이어 순서를 변경 빈도 기준으로 정렬
- **보안 우선** -- 비루트, 최소 권한, 시크릿 분리
- **헬스 체크** -- 컨테이너 상태를 자동으로 모니터링

<Arguments>
## 사용법
`/tenetx:docker {컨테이너화 대상}`

### 예시
- `/tenetx:docker Node.js API 서버 컨테이너화`
- `/tenetx:docker 기존 Dockerfile 최적화`
- `/tenetx:docker 개발 환경 Docker Compose 구성`
- `/tenetx:docker 프로덕션 배포용 이미지 보안 강화`

### 인자
- 컨테이너화할 애플리케이션, 최적화 목표 등을 설명
- 인자 없으면 프로젝트를 분석하여 적절한 Docker 구성을 제안
</Arguments>

$ARGUMENTS
