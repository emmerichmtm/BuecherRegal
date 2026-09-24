#!/usr/bin/perl
use strict; use warnings;
use IO::Socket::INET;
use File::Basename;
use File::Spec;
my $ROOT = dirname(File::Spec->rel2abs($0));
my $PORT = $ENV{PORT} || 8731;

$| = 1;
my $srv = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1', LocalPort => $PORT,
  Proto => 'tcp', Listen => 16, ReuseAddr => 1
) or die "listen failed: $!\n";
print "serving $ROOT on http://127.0.0.1:$PORT/\n";

my %MIME = (
  html=>'text/html; charset=utf-8', js=>'text/javascript', css=>'text/css',
  json=>'application/json', svg=>'image/svg+xml', png=>'image/png',
  woff2=>'font/woff2', pdf=>'application/pdf', txt=>'text/plain; charset=utf-8',
);

while (my $c = $srv->accept) {
  my $req = <$c>;
  unless (defined $req) { close $c; next; }
  while (my $h = <$c>) { last if $h =~ /^\r?\n$/; }
  my ($m, $u) = $req =~ m{^(\w+)\s+(\S+)};
  $u = '/' unless defined $u;
  $u =~ s/\?.*$//;
  $u =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;
  $u = '/index.html' if $u eq '/';
  $u =~ s{\.\.}{}g;
  my $path = $ROOT . $u;
  if (-f $path) {
    my ($ext) = $path =~ /\.(\w+)$/;
    my $type = $MIME{lc($ext||'')} || 'application/octet-stream';
    open my $fh, '<:raw', $path or next;
    local $/; my $body = <$fh>; close $fh;
    print $c "HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: " . length($body) .
             "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
    print $c $body;
  } else {
    my $body = "not found: $u";
    print $c "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: " .
             length($body) . "\r\nConnection: close\r\n\r\n$body";
  }
  close $c;
}
