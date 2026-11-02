# 운영 서버 배포 (직접 운영하는 Linux 서버)

기준일: 2026-11-02. 배포 파일은 저장소에 있다. 실제 서버·도메인·운영용 DataGSM 클라이언트는 운영자가 준비한다. 이 문서는 배포 절차일 뿐이며 시범 운영 시작 조건(세 가지 로그인, 학교의 비밀번호 배포 허락)을 대신하지 않는다. 그전까지 운영 서버는 운영자 본인의 현장 시험에만 쓴다.

## 구성

| 파일                   | 역할                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Dockerfile             | 관리자 웹·API 서버 이미지. Node 22, `next start`. DB는 `/data` 볼륨의 SQLite 세 개    |
| deploy/compose.yaml    | 와글 서버와 Caddy. 외부에는 Caddy의 80·443만 열고, 와글 서버 3000번은 내부망에만 둔다 |
| deploy/Caddyfile       | 도메인의 HTTPS 인증서를 자동 발급·갱신하고 와글 서버로 전달한다                       |
| deploy/.env.production | 서버에만 두는 비밀값 파일. 저장소·채팅·로그에 남기지 않는다(`.env.*`는 커밋 금지)     |

SQLite 파일을 쓰므로 디스크가 유지되는 서버여야 한다. 서버리스 호스팅은 쓰지 않는다.

## 준비물

- Docker와 Docker Compose가 설치된 Linux 서버. 80·443 포트를 외부에서 받을 수 있어야 한다.
- 서버 공인 IP를 가리키는 도메인(A 레코드). 예: `waggle.example.kr`. 앱은 운영 주소로 HTTPS만 받는다.
- 운영용 DataGSM OAuth 클라이언트. 로컬 개발용과 분리한다. 리다이렉트 URL은 `https://<도메인>/api/auth/callback/datagsm`.

## 처음 배포

서버에서 실행한다.

```sh
git clone https://github.com/sunwoo162/waggle.git && cd waggle
umask 077
cat > deploy/.env.production <<EOF
BETTER_AUTH_URL=https://<도메인>
BETTER_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n=' | tr '+/' '-_')
DATAGSM_CLIENT_ID=
WAGGLE_ADMIN_DATAGSM_ID=
WAGGLE_SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
```

`DATAGSM_CLIENT_ID`와 `WAGGLE_ADMIN_DATAGSM_ID`는 서버에서 편집기로 직접 채운다. 운영자 ID는 로컬에서 `npm run auth:whoami`로 확인한 값과 같다(DataGSM 계정 ID는 클라이언트와 무관). 로컬 개발 키를 복사하지 않고 새로 만든다.

```sh
# compose가 매번 자동으로 읽는 파일(커밋 금지). 이후 업데이트·백업 명령도 이 값으로 동작한다.
echo "WAGGLE_DOMAIN=<도메인>" > deploy/.env
docker compose -f deploy/compose.yaml build
# DB 스키마 준비는 운영자가 직접 실행한다(자동 실행하지 않음).
docker compose -f deploy/compose.yaml run --rm waggle npm run auth:migrate
docker compose -f deploy/compose.yaml run --rm waggle npm run settings:migrate
docker compose -f deploy/compose.yaml run --rm waggle npm run members:migrate
docker compose -f deploy/compose.yaml up -d
```

`https://<도메인>/admin`에서 DataGSM으로 로그인한다. 로컬 DB의 네트워크·AP는 옮기지 않고 운영 관리자 화면에서 다시 등록한다.

## 앱 연결

Windows·Android 앱의 서비스 주소에 `https://<도메인>`을 넣고, 운영 관리자 화면에서 발급한 개인 코드로 로그인한다.

## 업데이트

```sh
git pull
docker compose -f deploy/compose.yaml up -d --build
```

스키마가 바뀐 릴리스는 `up` 전에 위 migrate 명령을 다시 실행한다.

## 백업

DB는 `waggle-data` 볼륨에 있다. 암호화 키(`deploy/.env.production`)와 DB 백업은 따로 보관한다. 둘을 같은 곳에 두면 Wi-Fi 비밀번호 암호화가 의미 없어진다.

백업은 볼륨 안에 잠깐 만든 뒤 서버의 `backups/`로 꺼내고 볼륨 안 사본은 지운다. 백업에는 세션과 암호화된 토큰·Wi-Fi 비밀번호가 들어 있으므로 소유자만 읽게 두고, 이 서버 밖(다른 디스크·저장소)으로 옮겨 보관한다.

```sh
umask 077 && mkdir -p backups
c="docker compose -f deploy/compose.yaml"
$c exec waggle node -e "(async()=>{const D=require('better-sqlite3');for(const n of ['auth','school','members'])await new D('/data/'+n+'.sqlite',{readonly:true}).backup('/data/backup-'+n+'.sqlite')})()"
for n in auth school members; do
  $c cp waggle:/data/backup-$n.sqlite backups/$n-$(date +%F-%H%M).sqlite
done
$c exec waggle sh -c 'rm -f /data/backup-*.sqlite'
```

## 확인할 것

- `curl -I https://<도메인>/admin`이 로그인 화면으로 보내는지(307).
- `http://<도메인>`이 HTTPS로 넘어가는지.
- 3000번 포트가 외부에서 열려 있지 않은지.
