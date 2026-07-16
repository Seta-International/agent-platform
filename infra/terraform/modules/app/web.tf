# Web frontend: static SPA bundle on S3 behind CloudFront (OAC, bucket stays
# private). Deploy sync + invalidation and the custom domain (ACM + aliases)
# are wired at cutover — until then the distribution serves its default
# *.cloudfront.net domain.

resource "aws_s3_bucket" "web" {
  bucket        = var.web_bucket_name
  force_destroy = var.s3_force_destroy
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Custom domain: cert must live in us-east-1 for CloudFront. Validation is a
# CNAME added manually in Cloudflare (see web_acm_validation_records output);
# the validation resource polls until the cert issues.
resource "aws_acm_certificate" "web" {
  count             = var.web_domain == null ? 0 : 1
  provider          = aws.us_east_1
  domain_name       = var.web_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "web" {
  count           = var.web_domain == null ? 0 : 1
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.web[0].arn
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  comment             = "${var.name} web"
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes ap-southeast; All adds cost for no users
  is_ipv6_enabled     = true
  aliases             = var.web_domain == null ? [] : [var.web_domain]

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id       = "web-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed CachingOptimized policy (global constant id).
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # SPA deep links: S3+OAC answers 403 for unknown keys — serve the app instead.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.web_domain == null
    acm_certificate_arn            = var.web_domain == null ? null : aws_acm_certificate_validation.web[0].certificate_arn
    ssl_support_method             = var.web_domain == null ? null : "sni-only"
    minimum_protocol_version       = var.web_domain == null ? null : "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json
}
