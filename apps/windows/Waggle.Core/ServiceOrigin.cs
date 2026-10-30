using System.Text.RegularExpressions;

namespace Waggle.Core;

public static class ServiceOrigin
{
    public static Uri Parse(string value)
    {
        var input = value?.Trim() ?? "";
        if (input.Any(c => char.IsWhiteSpace(c) || char.IsControl(c)) || input.IndexOfAny(['?', '#', '@', '\\']) >= 0 ||
            !Uri.TryCreate(input, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host) || uri.AbsolutePath != "/" ||
            !(input.StartsWith("https://", StringComparison.OrdinalIgnoreCase) && uri.Scheme == "https" ||
              Regex.IsMatch(input, @"^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?/?$", RegexOptions.IgnoreCase)))
            throw new MemberException(Failure.InvalidInput);
        return new Uri(uri.GetLeftPart(UriPartial.Authority));
    }
}
