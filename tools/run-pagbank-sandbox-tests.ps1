param(
    [string]$OutputDir = ".\pagbank-evidencias-20260421"
)

$ErrorActionPreference = "Stop"

[Net.ServicePointManager]::SecurityProtocol = `
    [Net.SecurityProtocolType]::Tls12 -bor `
    ([Net.SecurityProtocolType]3072)

$Endpoint = "https://otwmjdiqjhumqvyztnbl.supabase.co/functions/v1/processar-pagamento-pagseguro"
$AnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Convert-HeadersToObject {
    param($Headers)

    $obj = [ordered]@{}
    foreach ($key in $Headers.Keys) {
        $value = $Headers[$key]
        if ($value -is [System.Array]) {
            $obj[$key] = ($value -join ", ")
        } else {
            $obj[$key] = [string]$value
        }
    }
    return $obj
}

function Save-Json {
    param(
        [string]$Path,
        $Data
    )

    $Data | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $Path
}

function Invoke-PagBankSandboxTest {
    param(
        [string]$Id,
        [string]$Name,
        [hashtable]$Body,
        [string]$Url = $Endpoint
    )

    $traceId = [guid]::NewGuid().ToString()
    $timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffzzz")
    $headers = @{
        "Content-Type"  = "application/json"
        "apikey"        = $AnonKey
        "Authorization" = "Bearer $AnonKey"
        "x-trace-id"    = $traceId
    }
    $jsonBody = $Body | ConvertTo-Json -Depth 20 -Compress

    $status = $null
    $content = ""
    $responseHeaders = @{}

    try {
        $res = Invoke-WebRequest -Method Post -Uri $Url -Headers $headers -Body $jsonBody -ContentType "application/json" -UseBasicParsing
        $status = [int]$res.StatusCode
        $content = [string]$res.Content
        $responseHeaders = Convert-HeadersToObject $res.Headers
    } catch {
        if ($_.Exception.Response) {
            $response = $_.Exception.Response
            $status = [int]$response.StatusCode
            $stream = $response.GetResponseStream()
            if ($stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                $content = $reader.ReadToEnd()
            }
            foreach ($key in $response.Headers.AllKeys) {
                $responseHeaders[$key] = $response.Headers[$key]
            }
        } else {
            $status = 0
            $content = $_.Exception.Message
        }
    }

    $safeHeaders = [ordered]@{
        "Content-Type"  = "application/json"
        "apikey"        = "<ANON_JWT_MASCARADO>"
        "Authorization" = "Bearer <ANON_JWT_MASCARADO>"
        "x-trace-id"    = $traceId
    }

    $requestData = [ordered]@{
        method = "POST"
        url = $Url
        headers = $safeHeaders
        body = $Body
    }

    try {
        $responseBody = $content | ConvertFrom-Json
    } catch {
        $responseBody = $content
    }

    $sbRequestId = $null
    foreach ($candidate in @("sb-request-id", "x-supabase-request-id", "cf-ray")) {
        if ($responseHeaders.Contains($candidate)) {
            $sbRequestId = $responseHeaders[$candidate]
            break
        }
    }

    $meta = [ordered]@{
        id = $Id
        name = $Name
        timestamp = $timestamp
        endpoint = $Url
        http_status = $status
        trace_id = $traceId
        sb_request_id = $sbRequestId
        response_headers = $responseHeaders
    }

    $prefix = Join-Path $OutputDir $Id
    Save-Json "$prefix-request.json" $requestData
    Save-Json "$prefix-response.json" $responseBody
    Save-Json "$prefix-meta.json" $meta

    return [pscustomobject]([ordered]@{
        id = $Id
        name = $Name
        timestamp = $timestamp
        http_status = $status
        trace_id = $traceId
        sb_request_id = $sbRequestId
        request_file = "$prefix-request.json"
        response_file = "$prefix-response.json"
        response = $responseBody
    })
}

$today = Get-Date -Format "yyyyMMdd-HHmmss"

$baseCheckout = @{
    environment = "sandbox"
    valor = 10.00
    itens = @(
        @{
            nome = "Produto Teste"
            quantidade = 1
            preco = 10.00
        }
    )
    nomeCliente = "CLIENTE TESTE"
    email = "comprador.teste@example.com"
    cpf = "12345678909"
    telefone = "83999999999"
}

$tests = @(
    @{
        Id = "INF-01-get-public-key"
        Name = "Obter chave publica sandbox"
        Body = @{
            environment = "sandbox"
            action = "get-public-key"
        }
    },
    @{
        Id = "INF-02-create-3ds-session"
        Name = "Criar sessao 3DS sandbox"
        Body = @{
            environment = "sandbox"
            action = "create-3ds-session"
        }
    },
    @{
        Id = "CC-01-checkout-credito"
        Name = "Checkout hospedado para credito"
        Body = $baseCheckout + @{
            pedidoId = "TESTE-CC-$today"
            metodoPagamento = "credit_card"
            redirectUrl = "https://www.jslembalagens.com.br/checkout-retorno.html?pedido=TESTE-CC-$today"
        }
    },
    @{
        Id = "DB-01-checkout-debito"
        Name = "Checkout hospedado para debito"
        Body = $baseCheckout + @{
            pedidoId = "TESTE-DB-$today"
            metodoPagamento = "debit_card"
            redirectUrl = "https://www.jslembalagens.com.br/checkout-retorno.html?pedido=TESTE-DB-$today"
        }
    },
    @{
        Id = "PIX-01-checkout-pix"
        Name = "Checkout hospedado para PIX"
        Body = $baseCheckout + @{
            pedidoId = "TESTE-PIX-$today"
            metodoPagamento = "pix"
            redirectUrl = "https://www.jslembalagens.com.br/checkout-retorno.html?pedido=TESTE-PIX-$today"
        }
    },
    @{
        Id = "CC-02-charge-direta-credito"
        Name = "Charge direta credito com cartao criptografado de teste"
        Body = @{
            environment = "sandbox"
            pedidoId = "TESTE-CHARGE-CC-$today"
            valor = 10.00
            tipo = "credit_card"
            parcelas = 1
            encryptedCard = "CARD_ENCRYPTED_TEST_001"
            nomeCliente = "CLIENTE TESTE"
            email = "comprador.teste@example.com"
            cpf = "12345678909"
            telefone = "83999999999"
            itens = @(
                @{
                    nome = "Produto Teste"
                    quantidade = 1
                    preco = 10.00
                }
            )
        }
    },
    @{
        Id = "DB-02-charge-direta-debito"
        Name = "Charge direta debito com cartao criptografado de teste"
        Body = @{
            environment = "sandbox"
            pedidoId = "TESTE-CHARGE-DB-$today"
            valor = 10.00
            tipo = "debit_card"
            parcelas = 1
            encryptedCard = "CARD_ENCRYPTED_TEST_002"
            authenticationId = "AUTH_TEST_001"
            nomeCliente = "CLIENTE TESTE"
            email = "comprador.teste@example.com"
            cpf = "12345678909"
            telefone = "83999999999"
            itens = @(
                @{
                    nome = "Produto Teste"
                    quantidade = 1
                    preco = 10.00
                }
            )
        }
    }
)

$results = @()
foreach ($test in $tests) {
    $results += Invoke-PagBankSandboxTest -Id $test.Id -Name $test.Name -Body $test.Body
}

$summaryPath = Join-Path $OutputDir "resumo-execucao.json"
Save-Json $summaryPath $results

$txt = New-Object System.Collections.Generic.List[string]
$txt.Add("===== RESUMO TESTES PAGBANK SANDBOX =====")
foreach ($item in $results) {
    $txt.Add("Teste: $($item.id) - $($item.name)")
    $txt.Add("Horario: $($item.timestamp)")
    $txt.Add("Status HTTP: $($item.http_status)")
    $txt.Add("trace_id: $($item.trace_id)")
    $txt.Add("sb_request_id: $($item.sb_request_id)")
    $txt.Add("Request file: $($item.request_file)")
    $txt.Add("Response file: $($item.response_file)")
    $txt.Add("------------------------------------")
}
$txt | Set-Content -Encoding UTF8 -Path (Join-Path $OutputDir "resumo-execucao.txt")

$results | Format-Table id, http_status, trace_id, sb_request_id -AutoSize
